const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');
const axios = require('axios');

const MailCustDetailController = require('./mail/MailCustDetailController');

class NoLogin_CustomerController {

    createCustomerDetailEntry = async (req, res) => {
        try {
            const {
                AgentId,
                FirstName,
                LastName,
                Email,
                Mobile,
                PanNumber,
                Pincode,
                PlanSelectionType,
                AgentEmail,
                UId
            } = req.body;

            // 1. Validation: Ensure mandatory fields are present
            if (!AgentId || !FirstName || !Mobile || !Email) {
                return base.send_response(
                    "Missing required fields (AgentId, FirstName, Email, and Mobile are mandatory).",
                    null,
                    res,
                    "Error",
                    400
                );
            }

            // 2. Call the Stored Procedure
            // Note: The procedure handles the creation of FullName internally using CONCAT 
            // and sets CreateDate using NOW()
            const [result] = await db.query(
                'CALL sp_InsertNoLoginCustomer(?, ?, ?, ?, ?, ?, ?,?,?)',
                [
                    AgentId,
                    FirstName,
                    LastName || null,
                    Email,
                    Mobile,
                    PanNumber || null,
                    Pincode || null,
                    PlanSelectionType || null,
                    UId || null
                ]
            );

            // 3. Trigger Email Notification to Agent
            // We call this asynchronously; it shouldn't block the client response
            if (AgentEmail) {
                // Constructing the body for the mailer
                const mailReq = {
                    body: {
                        AgentEmail,
                        AgentId,
                        customerDetails: {
                            FirstName,
                            LastName,
                            Email,
                            Mobile,
                            PanNumber,
                            Pincode,
                            PlanSelectionType
                        }
                    }
                };
                // Fire and forget or handle with .catch to not disrupt user flow
                MailCustDetailController.sendCustomerDetailsMail(mailReq).catch(err => {
                    logger.error(`Failed to send customer detail mail: ${err.message}`);
                });
            }
            // 4. Handle Success Response to UI
            return base.send_response(
                "Customer details recorded successfully.",
                {
                    AgentId,
                    FirstName,
                    LastName,
                    Mobile
                },
                res,
                "Success",
                200
            );



        } catch (error) {
            logger.error('createCustomerDetailEntry Error:', error);
            return base.send_response(
                "Internal Server Error while saving customer details.",
                error.message,
                res,
                "Error",
                500
            );
        }
    }


    async getAgentByAgentCode(req, res) {
        try {

            const agentCode = req.params.agentCode || req.query.agentCode || req.body.agentCode;

            if (!agentCode) {
                return base.send_response("Agent Code is required", null, res, 400);
            }

            const [rows] = await db.query('CALL get_agentbyagentcode(?)', [agentCode]);
            if (rows[0] && rows[0].length > 0) {
                base.send_response("Agents retrieved successfully", rows[0], res);
            } else {
                base.send_response("No record found for this employee", [], res);
            }


        } catch (error) {
            logger.error('Error in get_agentbyagentcode:', error);
            base.send_response("Error retrieving agents", null, res);
        }
    }

    async getCustomerList_emp_wise(req, res) {
        try {
            const { startdate, enddate, UId } = req.body;

            if (!startdate || !enddate) {
                return base.send_response(
                    "startdate and enddate are required",
                    null,
                    res,
                    400
                );
            }

            // Execute procedure
            const [rows] = await db.query(
                'CALL GetNoLoginCustomerStatus(?, ?, ?)',
                [startdate, enddate, UId || null]
            );

            const results = rows[0] || [];

            return base.send_response(
                results.length > 0
                    ? "Proposal MIS data fetched successfully"
                    : "No data found for the given filters",
                {
                    count: results.length,
                    proposals: results
                },
                res
            );
        } catch (error) {
            logger.error("getProposalMIS error:", error);
            return base.send_response(
                "Error occurred while fetching proposal data",
                null,
                res,
                500
            );
        }
    }

}

module.exports = new NoLogin_CustomerController();