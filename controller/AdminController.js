// controller/ApprovalController.js

const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');

class AdminController {
    // Get list of agents pending approval
    async getApprovalsAgentlist(req, res) {
        let connection;
        try {
            connection = await db.getConnection();
            const [rows] = await connection.execute('CALL get_Approval_agentlist()');

            if (rows && rows[0]) {
                return base.send_response("Approvals retrieved successfully", rows[0], res);
            } else {
                return base.send_response("No pending approvals found", [], res);
            }
        } catch (error) {
            logger.error('Error in getPendingApprovals:', error);
            return base.send_response("Error retrieving pending approvals", null, res);
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    // Get agents
    async getAgentDocumentsForApproval(req, res) {
        try {

            const UId = req.params.UId || req.query.UId || req.body.UId;

            const AgentId = req.params.AgentId || req.query.AgentId || req.body.AgentId;


            // Validate required parameters
            if (!UId || !AgentId) {
                return base.send_response("Both UID and Agent ID are required", null, res);
            }

            const [rows] = await db.query('CALL get_doc_agentid_approval(?, ?)', [UId, AgentId]);

            if (rows[0] && rows[0].length > 0) {
                base.send_response("Documents retrieved successfully", rows[0], res);
            } else {
                base.send_response("No documents found", [], res);
            }


        } catch (error) {
            logger.error('Error in get_doc_agentid_approval:', error);
            base.send_response("Error retrieving agents", null, res);
        }
    }

    // In AdminController.js - updateAgentApproval method
    async updateAgentApproval(req, res) {
        let connection;
        try {
            // Extract parameters from request body using exact parameter names
            const {
                "uId": uId,
                "agentId": agentId,
                "adminApproved": adminApproved,
                "adminComment": adminComment,
                "walletAmount": walletAmount
            } = req.body;

            // Debug log the incoming parameters with exact format
            console.log('Received parameters:', JSON.stringify({
                "uId": uId,
                "agentId": agentId,
                "adminApproved": adminApproved,
                "adminComment": adminComment,
                "walletAmount": walletAmount
            }, null, 2));

            // Validate required fields
            if (!agentId || !uId) {
                console.log('Validation failed - missing required fields');
                return base.send_response("Agent ID and UID are required", null, res);
            }

            connection = await db.getConnection();

            // Execute the stored procedure with exact parameter format
            const [result] = await connection.execute(
                'CALL update_agent_approval(?, ?, ?, ?, ?)',
                [uId, agentId, adminApproved, adminComment || '', walletAmount || '5000']
            );

            console.log('Stored procedure result:', JSON.stringify(result, null, 2));

            // Check if we got any results and specifically first row
            if (result && Array.isArray(result) && result[0] && Array.isArray(result[0]) && result[0][0]) {
                const affectedRows = result[0][0].AffectedRows || 0;
                console.log('Affected rows:', affectedRows);

                if (affectedRows > 0) {
                    // Send successful response with exact parameter format
                    return base.send_response("Agent approval status updated successfully", {
                        "uId": uId,
                        "agentId": agentId,
                        "adminApproved": adminApproved,
                        "adminComment": adminComment,
                        "walletAmount": walletAmount,
                        "updatedAt": new Date().toISOString()
                    }, res);
                } else {
                    console.log('No rows affected');
                    return base.send_response("No matching agent found or no changes made", null, res);
                }
            } else {
                console.log('Invalid result structure:', JSON.stringify(result, null, 2));
                return base.send_response("Invalid response from database", null, res);
            }

        } catch (error) {
            console.error('Error in updateAgentApproval:', {
                error: error.message,
                stack: error.stack,
                body: JSON.stringify(req.body, null, 2)
            });
            return base.send_response("Error updating agent approval status", null, res);
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    async get_agentlist_admin(req, res) {
        try {
            // Call the stored procedure to get pending wallet applications

            const { startdate, enddate } = req.body;

            if (!startdate || !enddate) {
                return base.send_response(
                    "startdate and enddate are required",
                    null,
                    res,
                    400
                );
            }


            const [rows] = await db.query('CALL get_agentlist_admin(?, ?)', [startdate, enddate]);


            if (rows && rows[0] && rows[0].length > 0) {
                return base.send_response("Agent  retrieved successfully", rows[0], res);
            } else {
                return base.send_response("No Agent  found", [], res);
            }
        } catch (error) {
            logger.error('Error in get_agentlist_admin:', error);
            return base.send_response("Error retrieving Agent", null, res);
        }
    }

    async get_agentnamelist_admin(req, res) {
        try {
            const { startdate, enddate, agentname } = req.body;

            // Corrected Validation:
            // Only return an error if BOTH the date range AND the agent name are missing.
            if ((!startdate || !enddate) && !agentname) {
                return base.send_response(
                    "Either a date range or an agent name is required for the search.",
                    null,
                    res,
                    400
                );
            }

            // The rest of your code is correct and will now execute properly.
            const [rows] = await db.query('CALL get_agentnamelist_admin(?, ?, ?)', [startdate, enddate, agentname]);

            if (rows && rows[0] && rows[0].length > 0) {
                return base.send_response("Agent retrieved successfully", rows[0], res);
            } else {
                return base.send_response("No Agent found", [], res);
            }
        } catch (error) {
            logger.error('Error in get_agentnamelist_admin:', error);
            return base.send_response("Error retrieving Agent", null, res);
        }
    }

    async updateAgentDetails(req, res) {
        try {
            const { AgentId, Payout,Payout_Practo,Payout_Ayush, Wallet_Amount } = req.body;

            // Corrected Validation:,
            // Only return an error if BOTH the date range AND the agent name are missing.
            if (!AgentId) {
                return base.send_response("AgentId is required.", null, res, 400);
            }
            const finalPayout = Payout !== undefined ? Payout : '0';
            const finalPracto = Payout_Practo !== undefined ? Payout_Practo : '0';
            const finalAyush = Payout_Ayush !== undefined ? Payout_Ayush : '0';
            const finalWallet = Wallet_Amount !== undefined ? Wallet_Amount : '0';

            // The rest of your code is correct and will now execute properly.
           const [rows] = await db.query(
                'CALL update_agent_details(?, ?, ?, ?, ?)', 
                [AgentId, finalPayout, finalPracto, finalAyush, finalWallet]
            ); 

           if (rows) {
                return base.send_response("Agent details updated successfully", rows, res);
            } else {
                return base.send_response("No changes made or Agent not found", [], res);
            }
        } catch (error) {
            logger.error('Error in update_agent_details:', error);
            return base.send_response("Error retrieving Agent", null, res);
        }
    }

}

module.exports = new AdminController();