// controller/ApprovalController.js

const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');

class AgentController {

    // Premium_including

    async getPremium_including(req, res) {
        try {
            const { duration, age_years, age_months, plan_amount, agentid } = req.body;

            // Call stored procedure
            const [rows] = await db.query(
                'CALL GetPremium_including(?,?,?,?,?)',
                [duration, age_years, age_months, plan_amount, agentid]
            );

            // Get first row of result
            const result = rows[0][0];

            if (result.SuccessStatus === '1') {
                // Successful login
                base.send_response(
                    "Premium including successful",
                    {
                        premium_amount: result.premium_amount,
                        agentcollected: result.agentcollected,
                        paymentmode: result.paymentmode,
                        payout: result.v_Payout,
                        reliance_premium_amount:result.reliance_premium_amount,
                        upfront_agent_commission:result.upfront_agent_commission
                    },
                    res
                );
            } else {
                // Failed login
                base.send_response(
                    result.Message || "Invalid credentials",
                    null,
                    res,
                    401
                );
            }

        } catch (error) {

            logger.error('Login error:', error);
            base.send_response(
                "Error during login process",
                null,
                res,
                500
            );
        }
    }

    // Premium_excluding

    async getPremium_excluding(req, res) {
        try {
            const { duration, age_years, age_months, plan_amount, agentid } = req.body;

            // Call stored procedure
            const [rows] = await db.query(
                'CALL GetPremium_excluding(?,?,?,?,?)',
                [duration, age_years, age_months, plan_amount, agentid]
            );

            // Get first row of result
            const result = rows[0][0];

            if (result.SuccessStatus === '1') {
                // Successful login
                base.send_response(
                    "Premium excluding successful",
                    {
                        premium_amount: result.premium_amount,
                        agentcollected: result.agentcollected,
                        paymentmode: result.paymentmode,
                        payout: result.v_Payout,
                        reliance_premium_amount:result.reliance_premium_amount,                       
                        upfront_agent_commission:result.upfront_agent_commission
                    },
                    res
                );
            } else {
                // Failed login
                base.send_response(
                    result.Message || "Invalid credentials",
                    null,
                    res,
                    401
                );
            }

        } catch (error) {

            logger.error('Login error:', error);
            base.send_response(
                "Error during login process",
                null,
                res,
                500
            );
        }
    }

    async get_agentbyagentid(req, res) {
        try {

            const agentId = req.params.agentId || req.query.agentId || req.body.agentId;

            if (!agentId) {
                return base.send_response("Agent Id is required", null, res, 400);
            }

            const [rows] = await db.query('CALL get_agentbyagentid(?)', [agentId]);

            if (rows[0] && rows[0].length > 0) {
                base.send_response("Agents retrieved successfully", rows[0], res);
            } else {
                base.send_response("No record found for this employee", [], res);
            }


        } catch (error) {
            logger.error('Error in get_agentbyagentid:', error);
            base.send_response("Error retrieving agents", null, res);
        }
    }


    async InsertWalletApply(req, res) {
        try {
            const {
                AgentId,
                Agent_Code,
                wallet_amount
            } = req.body;
            const [result] = await db.query(
                'CALL InsertWalletApply(?, ?, ?)',
                [AgentId,
                    Agent_Code,
                    wallet_amount
                ]
            );          
            const procedureResult = result?.[0]?.[0] || {};
            base.send_response(
                procedureResult.message || "User inserted successfully",
                procedureResult,
                res,
                procedureResult.status || "Success",
                0
            );
        } catch (error) {
            console.error("Error in User:", error);
            // logger.error("Error in User:", error);
            base.send_response("Error inserting User", null, res, "Error", 1);
        }
    }

    async getWalletApplications(req, res) {
        try {
            // Call the stored procedure to get pending wallet applications
            const [rows] = await db.query('CALL sp_GetWalletByAgentCode()');

            if (rows && rows[0] && rows[0].length > 0) {
                return base.send_response("Wallet applications retrieved successfully", rows[0], res);
            } else {
                return base.send_response("No pending wallet applications found", [], res);
            }
        } catch (error) {
            logger.error('Error in getWalletApplications:', error);
            return base.send_response("Error retrieving wallet applications", null, res);
        }
    }

    async   processWalletApplication(req, res) {
        try {
                const { agentCode, status, adminComment, amount } = req.body;

                // Validate required fields
                if (!agentCode || !status) {
                    return base.send_response("Agent code and status are required", null, res, "Error", 1);
                }

                // Status should be either 'Approved' or 'Rejected'
                if (status !== 'Approved' && status !== 'Rejected') {
                    return base.send_response("Status must be 'Approved' or 'Rejected'", null, res, "Error", 1);
                }

                // Call stored procedure to process the wallet application
                // Note: You'll need to create this stored procedure
                const [result] = await db.query(
                    'CALL sp_ProcessWalletApplication(?, ?, ?, ?)',
                    [agentCode, status, adminComment || '', amount || 0]
                );

            const procedureResult = result[0][0];

            return base.send_response(
                procedureResult?.message || `Wallet application ${status.toLowerCase()} successfully`,
                procedureResult,
                res
            );

        } catch (error) {
            logger.error('Error in processWalletApplication:', error);
            return base.send_response("Error processing wallet application", null, res, "Error", 1);
        }
    }


  
}

module.exports = new AgentController();