// controller/PractoController.js
const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');
const axios = require('axios');

class PractoController {

    async getSubscriptionStatus(req, res) {
        try {
            const { AgentId } = req.body;

            if (!AgentId) {
                return base.send_response("AgentId is required.", null, res, "Error", 400);
            }

            // Call the stored procedure to get the subscription status
            const [statusRows] = await db.query('CALL sp_GetPractoSubscriptionStatus(?)', [AgentId]);
            const subscriptionData = statusRows[0][0]; // This will be an object like { Practo_Subscription: 'Y' }

            return base.send_response(
                "Subscription status retrieved successfully.",
                subscriptionData,
                res,
                "Success"
            );

        } catch (error) {
            logger.error('Error in getSubscriptionStatus:', error);
            return base.send_response("An internal server error occurred while checking status.", error.message, res, "Error", 500);
        }
    }

    async createPractoProposal(req, res) {
    try {
        const {
            AgentId,
            FullName,
            EmailID,
            MobileNumber,
            plan_id
        } = req.body;

        // 1. Validate input
        if (!AgentId || !FullName || !EmailID || !MobileNumber || !plan_id) {
            return base.send_response(
                "Missing required fields for proposal creation.",
                null,
                res,
                "Error",
                400
            );
        }

        // 2. Call Practo API
        const practoApiUrl = 'https://horizon.policyboss.com:5443/practo/practo_subscription_wrapper';
        const practoPayload = {
            plan_id: plan_id,
            user_name: FullName,
            user_mobile: MobileNumber,
            user_email: EmailID,
            source: "ZEXTRA"
        };

        const practoResponse = await axios.post(practoApiUrl, practoPayload);
        const responseData = practoResponse.data;
        console.log("Full Practo Response:", responseData);

        // 3. Extract Practo_Response details safely
        const practoRes = responseData?.Data?.Practo_Response || {};
        const practoStatus = practoRes?.status?.toLowerCase() || "";
        const practoMessage = practoRes?.message || "";

        // 4. Handle success or failure conditions
        if (practoStatus === "success" && practoMessage === "Subscription created successfully") {
            // ✅ Success → Insert into database
            const [insertResult] = await db.query(
                'CALL sp_InsertPractoProposal(?, ?, ?, ?, ?)',
                [AgentId, FullName, EmailID, MobileNumber, plan_id]
            );

            const procedureResult = insertResult?.[0]?.[0] || {};
            console.log("DB Insert Result:", procedureResult);

            return base.send_response(
                "Practo proposal created successfully.",
                {
                    ...procedureResult,
                    practoResponseMessage: practoMessage,
                    practoStatus: practoStatus
                },
                res,
                "Success"
            );
        } else {
            // ❌ Failure → Don't insert, return message from Practo API
            return base.send_response(
                practoMessage || "Failed to create Practo subscription.",
                practoRes,
                res,
                "Error",
                400
            );
        }

    } catch (error) {
        logger.error('Error in createPractoProposal:', error);
        if (error.response) {
            return base.send_response("Error from Practo API", error.response.data, res, "Error", error.response.status);
        } else if (error.request) {
            return base.send_response("No response received from Practo API", null, res, "Error", 504);
        } else {
            return base.send_response("An internal server error occurred", error.message, res, "Error", 500);
        }
    }
}


    async updatePractoProposalWallet(req, res) {
        try {
            const {
            AgentId,
            Practo_proposal_id,           
            Selected_Payment_Mode,
            Selected_PremiumAmount,
            premium_amount,
            gst_amount,
            commission_agent,
            tds_amount,           
            payout_percentage           
            } = req.body;

            // Validate the required fields for the wallet payment
            if (!AgentId || !Selected_PremiumAmount || !Practo_proposal_id) {
                return base.send_response("AgentId, Selected_PremiumAmount, and Practo_proposal_id are required.", null, res, "Error", 400);
            }

            // Call the stored procedure to update the proposal and deduct from the wallet
            const [result] = await db.query(
                 'CALL sp_UpdatePractoProposal_wallet(?, ?, ?, ?, ?, ?, ?, ?, ?)',
                 [
                AgentId,
                Practo_proposal_id,
                Selected_Payment_Mode || null,
                Selected_PremiumAmount || null,
                premium_amount || null,
                gst_amount || null,
                commission_agent || null,
                tds_amount || null,             
                payout_percentage || null,
              
            ]
            );

            const procedureResult = result?.[0]?.[0] || {};
            console.log(procedureResult);
            // Check the status from the procedure and send the response
            return base.send_response(
                procedureResult.message || "Wallet payment processed successfully.",
                procedureResult,
                res,
                procedureResult.status || "Success"
            );
        } catch (error) {
            logger.error('Error in updatePractoProposalWallet:', error);
            return base.send_response("An internal server error occurred during wallet payment.", error.message, res, "Error", 500);
        }
    }

    async getPractoPremium(req, res) {
    try {
        const { AgentId } = req.body;

        // 1. Validate that AgentId was provided
        if (!AgentId) {
            return base.send_response("AgentId is required.", null, res, "Error", 400);
        }

        // 2. Call the stored procedure
        const [result] = await db.query('CALL GetPracto_Premium(?)', [AgentId]);

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
        logger.error('Error in getPractoPremium:', error);
        return base.send_response("An internal server error occurred while fetching premium details.", error.message, res, "Error", 500);
    }
}
}

module.exports = new PractoController();

