// controller/AyushController.js
const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');
const axios = require('axios');
const https = require('https');
const crypto = require('crypto');

// Configuration
const AYUSH_CONFIG = {
    BASE_URL: "https://sandbox.ayushpay.com",
    USERNAME: "aupy.testuser2.user",
    PASSWORD: "Qwerty@123"
};

// Create an HTTPS Agent that disables Keep-Alive to prevent socket hang ups
const httpsAgent = new https.Agent({
    keepAlive: false,
    rejectUnauthorized: false
});

// Create a configured axios instance
const ayushClient = axios.create({
    baseURL: AYUSH_CONFIG.BASE_URL,
    httpsAgent: httpsAgent,
    headers: {
        'Content-Type': 'application/json',
        'Connection': 'close'
    },
    timeout: 30000
});

class AyushController {


    checkDuplicate = async (req, res) => {
        try {
            const { mobile, email } = req.body;

            if (!mobile || !email) {
                return base.send_response("Mobile and Email are required for duplicate check.", null, res, "Error", 400);
            }

            // Call the Stored Procedure
            const [rows] = await db.query('CALL sp_CheckAyushDuplicate(?, ?)', [mobile, email]);

            if (!rows || !rows[0] || !rows[0][0]) {
                return base.send_response("Error checking duplicate status.", null, res, "Error", 500);
            }

            const result = rows[0][0];

            console.log("Duplicate Check Result:", result);

            // FIX: If duplicate found, manually send response to force 'Failure' status
            // bypassing base.send_response which might be forcing 'Success' on 200 OK
            if (result.DuplicateCount > 0) {
                return res.status(200).json({
                    Status: "Failure", // Explicitly set Failure
                    Message: "Failure",//User with this mobile or email already exists.
                    MasterData: { DuplicateCount: result.DuplicateCount }
                });
            } else {
                return base.send_response(
                    "User is unique. Proceed.",
                    { DuplicateCount: 0 },
                    res,
                    "Success",
                    200
                );
            }

        } catch (error) {
            logger.error('checkDuplicate Error:', error);
            return base.send_response("Internal Server Error checking duplicate.", error.message, res, "Error", 500);
        }
    }

    // Helper: Step 1 Generate Token
    _generateToken = async () => {
        try {
            const response = await ayushClient.post(`/v3/apis/webapi/token/generate-token/`, {
                username: AYUSH_CONFIG.USERNAME,
                password: AYUSH_CONFIG.PASSWORD
            });

            if (response.data?.msg?.token) return response.data.msg.token;
            throw new Error("Token generation failed");
        } catch (error) {
            console.error("Token Error:", error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Complete AyushPay Proposal Flow (Steps 1 - 7)
     */
    createAyushPayProposal = async (req, res) => {
        try {
            const {
                AgentId,
                first_name,
                last_name,
                email,
                mobile,
                pan_number,
                pincode,
                Ayushpayplan_id,
                Ayushpay_PlanName,
                amount
            } = req.body;

            // 1. Validation
            if (!AgentId || !mobile || !first_name || !pan_number || !email) {
                return base.send_response("Missing required fields.", null, res, "Error", 400);
            }

            // --- Step 1: Generate Token ---
            const token = await this._generateToken();

            // --- Step 2: Register Application ---
            const registerRes = await ayushClient.post(
                `/v3/apis/webapi/application/register/`,
                { mobile: mobile },
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            const applicationId = registerRes.data?.msg?.id;
            if (!applicationId) throw new Error("Application Registration failed");

            // --- Step 3: Submit Personal Details ---
            await ayushClient.post(
                `/apis/infin/v2/applications/${applicationId}/personal-detail/`,
                { first_name, last_name, pan_number, email, pincode },
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            // --- Step 4: Get Subscription List ---
            const plansRes = await ayushClient.get(
                `/v3/apis/webapi/v4/applications/${applicationId}/subscriptions/`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            const items = plansRes.data?.msg?.items || [];
            if (items.length === 0) {
                throw new Error("No subscription plans available for this user.");
            }

            const firstItem = items[0];
            const subscriptionObj = firstItem?.subscription;

            if (!subscriptionObj || !subscriptionObj.id) {
                throw new Error("Failed to find valid Subscription object in API response.");
            }

            const subscriptionId = subscriptionObj.id;

            // --- Step 5: Partner Payment Collection ---
            const txtid = `TXN_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

            // --- Step 6: Issue Subscription ---
            await ayushClient.post(
                `/v3/apis/webapi/v4/applications/${applicationId}/apply-subscription/`,
                {
                    subscription_id: subscriptionId,
                    txtid: txtid
                },
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            // --- Step 7: Get Subscription Details ---
            const detailRes = await ayushClient.get(
                `/apis/infin/v2/applications/${applicationId}/subscription-detail/`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            const subscriptionDetails = detailRes.data;

            // --- DB Insert ---
            const [insertResult] = await db.query(
                'CALL sp_InsertAyushProposal(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    AgentId,
                    first_name,
                    last_name,
                    email,
                    mobile,
                    pan_number,
                    pincode,
                    subscriptionId,
                    Ayushpay_PlanName,
                    applicationId,
                    txtid,
                    Ayushpayplan_id,
                    amount,
                    JSON.stringify(subscriptionDetails)
                ]
            );

            return base.send_response("Proposal created successfully.", {
                ...insertResult[0][0],
                Ayush_ApplicationId: applicationId,
                SubscriptionId: subscriptionId,
                TransactionId: txtid,
                Amount: amount,
                Details: subscriptionDetails
            }, res, "Success");

        } catch (error) {
            logger.error('createAyushPayProposal Error:', error);
            const apiMsg = error.response?.data?.msg || error.message;
            return base.send_response(apiMsg, null, res, "Error", 500);
        }
    }

    updateAyushProposalWallet = async (req, res) => {
        try {
            const {
                AgentId,
                Ayush_id,
                Selected_Payment_Mode,
                Selected_PremiumAmount,
                premium_amount,
                gst_amount,
                commission_agent,
                tds_amount,
                payout_percentage
            } = req.body;

            // Validate required fields
            if (!AgentId || !Selected_PremiumAmount || !Ayush_id) {
                return base.send_response("AgentId, Selected_PremiumAmount, and Ayush_id are required.", null, res, "Error", 400);
            }

            // Call the stored procedure
            const [result] = await db.query(
                'CALL sp_UpdateAyushProposal_wallet(?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    AgentId,
                    Ayush_id,
                    Selected_Payment_Mode || null,
                    Selected_PremiumAmount || null,
                    premium_amount || null,
                    gst_amount || null,
                    commission_agent || null,
                    tds_amount || null,
                    payout_percentage || null
                ]
            );

            const procedureResult = result?.[0]?.[0] || {};
            console.log("Wallet Update Result:", procedureResult);

            return base.send_response(
                procedureResult.message || "Wallet payment processed successfully.",
                procedureResult,
                res,
                procedureResult.status || "Success"
            );

        } catch (error) {
            logger.error('Error in updateAyushProposalWallet:', error);
            return base.send_response("An internal server error occurred during wallet payment.", error.message, res, "Error", 500);
        }
    }

    async getAyushPayPremium(req, res) {
        try {
            const { AgentId } = req.body;

            // 1. Validate that AgentId was provided
            if (!AgentId) {
                return base.send_response("AgentId is required.", null, res, "Error", 400);
            }

            // 2. Call the stored procedure
            const [result] = await db.query('CALL GetAyushPay_Premium(?)', [AgentId]);

            // 3. The actual data is in the first element of the first array
            const premiumDetails = result?.[0]?.[0];

            // 4. Check if any data was returned
            if (!premiumDetails) {
                return base.send_response(`No details found for AgentId: ${AgentId}`, null, res, "Error", 404);
            }

            // 5. Send the successful response
            return base.send_response(
                "Premium details retrieved successfully.",
                premiumDetails,
                res,
                "Success"
            );

        } catch (error) {
            logger.error('Error in GetAyushPay_Premium:', error);
            return base.send_response("An internal server error occurred while fetching premium details.", error.message, res, "Error", 500);
        }
    }
}

module.exports = new AyushController();