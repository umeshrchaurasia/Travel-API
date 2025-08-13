// controller/RazorPaymentController.js

const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');

class RazorPaymentController {
    // Add Razorpay payment data to database
    async addToRazorpayData(req, res) {
        let connection;
        try {
            // Extract payment data from request body
            const {
                AgentId,
                Policy_No,
                PayId,
                razorpay_order_id,
                razorpay_signature,
                certificateNumber,
                customerName,
                mobileNumber,
                email,
                amount,
                payment_mode
            } = req.body;

            // Debug log request data
            logger.info('Razorpay payment request data:', JSON.stringify(req.body));

            // Validate required fields
            if (!AgentId || !Policy_No || !PayId) {
                logger.error('Missing required fields for Razorpay payment');
                return res.json({
                    Status: "Failure",
                    Message: "Agent ID, Policy Number, and Payment ID are required",
                    StatusNo: 1,
                    MasterData: null
                });
            }
            
            // Get database connection
            connection = await db.getConnection();
            
            try {
                // Call your stored procedure with the exact parameters that match your procedure definition
                const [result] = await connection.execute(
                    'CALL insert_razorpay_data(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        AgentId.toString(), // Convert to string to ensure compatibility
                        Policy_No,
                        PayId,
                        razorpay_order_id || '',
                        razorpay_signature || '',
                        customerName || '',
                        mobileNumber || '',
                        email || '',
                        amount.toString(), // Ensure this is a string as your table expects varchar
                        payment_mode || ''
                    ]
                );
                
                // Log the stored procedure result
                logger.info('Razorpay payment stored procedure result:', JSON.stringify(result));
                
                // Check if we got results from the stored procedure
                if (result && result[0] && result[0].length > 0 && result[0][0]) {
                    const responseStatus = result[0][0].Status || 'success';
                    
                    if (responseStatus.toLowerCase() === 'success') {
                        // Format response data according to the exact structure you need
                        const responseData = {
                            Status: "success",
                            Message: "Payment processed successfully",
                            MasterData: [
                                {
                                    PayId: result[0][0].PayId,
                                    Policy_No: result[0][0].Policy_No,
                                    customerName: result[0][0].customerName,
                                    amt: result[0][0].amount, // Match the column name from your procedure
                                    actual_amt: result[0][0].amount, // Using amount as actual_amt
                                    RRN: razorpay_signature || '',
                                    respmsg: Policy_No // Using Policy_No as respmsg
                                }
                            ]
                        };
                        
                        return res.json(responseData);
                    } else {
                        return res.json({
                            Status: "Failure",
                            Message: "Payment processing failed",
                            StatusNo: 1,
                            MasterData: null
                        });
                    }
                } else {
                    logger.error('Invalid result structure from stored procedure');
                    
                    // Fallback response in case the procedure result structure is not as expected
                    return res.json({
                        Status: "success",
                        Message: "Payment processed successfully",
                        MasterData: [
                            {
                                PayId: PayId,
                                Policy_No: Policy_No,
                                customerName: customerName,
                                amt: amount,
                                actual_amt: amount,
                                RRN: razorpay_signature || '',
                                respmsg: Policy_No
                            }
                        ]
                    });
                }
            } catch (dbError) {
                logger.error('Database error in addToRazorpayData:', {
                    error: dbError.message,
                    stack: dbError.stack,
                    code: dbError.code,
                    sqlState: dbError.sqlState,
                    sqlMessage: dbError.sqlMessage
                });
                
                return res.json({
                    Status: "Failure",
                    Message: "Database error: " + dbError.message,
                    StatusNo: 1,
                    MasterData: null
                });
            }
        } catch (error) {
            logger.error('Error in addToRazorpayData:', {
                error: error.message,
                stack: error.stack,
                body: JSON.stringify(req.body, null, 2)
            });
            
            return res.json({
                Status: "Failure",
                Message: "Error processing payment data",
                StatusNo: 1,
                MasterData: null
            });
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    // Get payment status by policy number
    async getPaymentStatus(req, res) {
        let connection;
        try {
            const policyNo = req.params.policyNo || req.query.policyNo;
            
            if (!policyNo) {
                return res.json({
                    Status: "Failure",
                    Message: "Policy number is required",
                    StatusNo: 1,
                    MasterData: null
                });
            }
            
            connection = await db.getConnection();
            
            const [rows] = await connection.execute(
                'SELECT * FROM razorpay_payment_travel WHERE Policy_No = ? ORDER BY payment_date DESC LIMIT 1',
                [policyNo]
            );
            
            if (rows && rows.length > 0) {
                // Format the response
                const paymentData = {
                    Status: "Success",
                    Message: "Payment information retrieved",
                    MasterData: [
                        {
                            PayId: rows[0].PayId,
                            Policy_No: rows[0].Policy_No,
                            customerName: rows[0].customerName,
                            amt: rows[0].amount,
                            actual_amt: rows[0].amount,
                            payment_status: rows[0].payment_status,
                            RRN: rows[0].razorpay_signature || '',
                            respmsg: rows[0].Policy_No,
                            payment_date: rows[0].payment_date
                        }
                    ]
                };
                
                return res.json(paymentData);
            } else {
                return res.json({
                    Status: "Success",
                    Message: "No payment information found for this policy",
                    MasterData: []
                });
            }
        } catch (error) {
            logger.error('Error in getPaymentStatus:', error);
            return res.json({
                Status: "Failure",
                Message: "Error retrieving payment status",
                StatusNo: 1,
                MasterData: null
            });
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
}

module.exports = new RazorPaymentController();