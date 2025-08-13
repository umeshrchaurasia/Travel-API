// controller/BatchPaymentController.js
const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');

class BatchPaymentController {
    // Get proposal details by agent and payment status
    async getProposalDetailsByAgent(req, res) {
        try {
            const { agentId, paymentStatus } = req.body;

            // Input validation
            if (!agentId) {
                return base.send_response(
                    "Agent ID is required",
                    null,
                    res,
                    400
                );
            }

            // Call stored procedure
            const [rows] = await db.query(
                'CALL GetProposalDetailsByAgent(?, ?)',
                [agentId, paymentStatus || null]
            );

            // Get the result rows
            const results = rows[0];

            if (results && results.length > 0) {
                // Successful query
                base.send_response(
                    "Proposal details retrieved successfully",
                    {
                        count: results.length,
                        proposals: results
                    },
                    res
                );
            } else {
                // No results found
                base.send_response(
                    "No proposals found for the given criteria",
                    {
                        count: 0,
                        proposals: []
                    },
                    res
                );
            }
        } catch (error) {
            logger.error('GetProposalDetailsByAgent error:', error);
            base.send_response(
                "Error retrieving proposal details",
                null,
                res,
                500
            );
        }
    }

    // Insert batch payment Agent
    async insertBatchPayment(req, res) {
        try {
            const { agentCode, policyNo, totalAmount, paymentMode, utr } = req.body;

            // Input validation
            if (!agentCode || !policyNo || !totalAmount || !paymentMode) {
                return base.send_response(
                    "Missing required fields: agentCode, policyNo, totalAmount, and paymentMode are required",
                    null,
                    res,
                    400
                );
            }

            // Split the policy numbers using pipe symbol as separator
            const policyNumbers = policyNo.split('||').map(pn => pn.trim()).filter(Boolean);

            if (policyNumbers.length === 0) {
                return base.send_response(
                    "No valid policy numbers provided",
                    null,
                    res,
                    400
                );
            }

            logger.info(`Processing batch payment for ${policyNumbers.length} policies with agent code ${agentCode}`);

            // Call the stored procedure
            const [rows] = await db.query(
                'CALL InsertBatchPayment_Agent(?, ?, ?, ?, ?)',
                [agentCode, policyNo, totalAmount, paymentMode, utr || '']
            );

            // Get first row of result
            const result = rows[0][0];

            if (result && result.Result === 'Success') {
                // Successful insertion
                logger.info(`Batch payment processed successfully: ${result.payment_ref}`);

                base.send_response(
                    "Payment processed successfully",
                    {
                        paymentRefNo: result.payment_ref,
                        agentCode: result.Agent_Code,
                        message: result.message,
                        status: result.SavedStatus,
                        processedPolicies: policyNumbers.length
                    },
                    res
                );
            } else {
                // Failed insertion
                logger.error(`Batch payment failed: ${result?.message || 'Unknown error'}`);

                base.send_response(
                    result?.message || "Payment processing failed",
                    null,
                    res,
                    400
                );
            }
        } catch (error) {
            logger.error('InsertBatchPayment error:', error);
            base.send_response(
                "Error processing payment",
                null,
                res,
                500
            );
        }
    }


    // Get batch payments by payment status ADMIN

    async getBatchPaymentsByStatus(req, res) {
        try {
            const { status } = req.body;

            if (!status) {
                return base.send_response(
                    "Payment status is required",
                    null,
                    res,
                    400
                );
            }

            // Call stored procedure
            const [rows] = await db.query(
                'CALL GetBatchPaymentsByAdminApproval(?)',
                [status]
            );

            // Get the result rows
            const results = rows[0];

            if (results && results.length > 0) {
                base.send_response(
                    `${results.length} batch payments found with status: ${status}`,
                    {
                        count: results.length,
                        payments: results
                    },
                    res
                );
            } else {
                base.send_response(
                    `No batch payments found with status: ${status}`,
                    {
                        count: 0,
                        payments: []
                    },
                    res
                );
            }
        } catch (error) {
            logger.error('GetBatchPaymentsByStatus error:', error);
            base.send_response(
                "Error fetching batch payments",
                null,
                res,
                500
            );
        }
    }

    async updateBatchPayment(req, res) {
        try {
            const { paymentRefNo, newStatus, utr, agentCode } = req.body;

            // Input validation
            if (!paymentRefNo || !newStatus) {
                return base.send_response(
                    "Payment reference number and new status are required",
                    null,
                    res,
                    400
                );
            }

            logger.info(`Updating batch payment: ${paymentRefNo} to status: ${newStatus}`);

            try {
                // Call stored procedure
                const [results] = await db.query(
                    'CALL UpdateBatchPayment_SP(?, ?, ?, ?)',
                    [paymentRefNo, newStatus, utr || null, agentCode]
                );

                // Get first row of result
                const result = results[0][0];

                if (result && result.Result === 'Success') {
                    logger.info(`Successfully updated payment ${paymentRefNo} to status ${newStatus}`);

                    base.send_response(
                        result.message,
                        {
                            paymentRefNo: result.paymentRefNo,
                            status: result.newStatus,
                            utr: result.utr
                        },
                        res
                    );
                } else {
                    logger.error(`Failed to update payment ${paymentRefNo}`);

                    base.send_response(
                        "Payment update failed",
                        null,
                        res,
                        400
                    );
                }
            } catch (error) {
                logger.error(`Database error: ${error.message}`);

                // If the error is from stored procedure's SIGNAL
                if (error.sqlState === '45000') {
                    base.send_response(
                        error.message,
                        null,
                        res,
                        404
                    );
                } else {
                    throw error; // Re-throw to be caught by outer catch block
                }
            }
        } catch (error) {
            logger.error('UpdateBatchPayment error:', error);
            base.send_response(
                "Error updating batch payment",
                null,
                res,
                500
            );
        }
    }

}

module.exports = new BatchPaymentController();




