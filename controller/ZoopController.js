// controller/ZoopController.js - Updated to match your project structure

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');

class ZoopController {

    // In your ZoopController.js - Replace the verifyPANpro method with this:

 async verifyPANpro(req, res) {
        try {
            // Extract PAN number from request body (supporting both field names)
            const { pan_number, customer_pan_number, Pan_Number } = req.body;
            const panNumber = pan_number || customer_pan_number || Pan_Number;

            if (!panNumber) {
                return base.send_response(
                    "PAN number is required (use pan_number, customer_pan_number, or Pan_Number)",
                    null,
                    res,
                    400
                );
            }

            logger.info(`Starting PAN Pro verification for: ${panNumber}`);

            // Validate PAN number format
            if (!panNumber || typeof panNumber !== 'string') {
                return base.send_response(
                    "Invalid PAN number format",
                    null,
                    res,
                    400
                );
            }

            // Use new API endpoint
            const apiUrl = 'https://horizon.policyboss.com:5443/kyc_details/zoop_pan_pro';

            const headers = {
                'Content-Type': 'application/json'
            };

            // New request body format
            const requestBody = {
                Pan_Number: panNumber,
                Source: "ISTRAVEL"
            };

            logger.info(`Making PAN Pro verification request to: ${apiUrl}`);
            logger.info(`Request Body: ${JSON.stringify(requestBody, null, 2)}`);

            const response = await axios({
                method: 'POST',
                url: apiUrl,
                headers: headers,
                data: requestBody,
                timeout: 30000
            });

            logger.info('PAN Pro verification response received:', response.data);

            // Parse the response according to new API format
            if (response.data.Status === "Success" && response.data.data && response.data.data.result) {
                // SUCCESS CASE: PAN verification successful with data
                logger.info('PAN verification successful, saving to database...');

                const apiData = response.data.data;
                const result = apiData.result;

                try {
                    // Prepare response string - handle length limit of VARCHAR(1000)
                    const fullResponseString = JSON.stringify(response.data);
                    const responseString = fullResponseString.length > 1000 ?
                        fullResponseString.substring(0, 997) + '...' : fullResponseString;

                    // Extract full name from result
                    const fullName = result.user_full_name || '';

                    logger.info(`Calling stored procedure SavePanCardDetails with params: ${panNumber}, ${fullName}, response length: ${responseString.length}`);

                    // Call stored procedure to save PAN details
                    const [saveResults] = await db.query('CALL SavePanCardDetails(?, ?, ?)', [
                        panNumber,
                        fullName,
                        responseString
                    ]);

                    logger.info('PAN details saved successfully to database');
                    logger.info('Save results:', saveResults);

                    // Get the saved record details
                    const savedRecord = saveResults[0] && saveResults[0][0] ? saveResults[0][0] : null;

                    return base.send_response(
                        "PAN verification successful",
                        {
                            request_id: apiData.request_id,
                            task_id: apiData.task_id,
                            group_id: apiData.group_id,
                            response_code: apiData.response_code,
                            response_message: apiData.response_message,
                            result: apiData.result,
                            billable: apiData.metadata?.billable,
                            request_timestamp: apiData.request_timestamp,
                            response_timestamp: apiData.response_timestamp,
                            database_save: {
                                status: 'Success',
                                saved_id: savedRecord?.id,
                                saved_at: savedRecord?.create_date,
                                message: savedRecord?.message || 'PAN details saved successfully'
                            }
                        },
                        res
                    );
                } catch (dbError) {
                    logger.error('Error saving PAN details to database:', dbError);

                    // Return success for API call but note database save issue
                    return base.send_response(
                        "PAN verification successful (database save failed)",
                        {
                            request_id: apiData.request_id,
                            task_id: apiData.task_id,
                            group_id: apiData.group_id,
                            response_code: apiData.response_code,
                            response_message: apiData.response_message,
                            result: apiData.result,
                            billable: apiData.metadata?.billable,
                            request_timestamp: apiData.request_timestamp,
                            response_timestamp: apiData.response_timestamp,
                            database_save: {
                                status: 'Failed',
                                error: dbError.message || 'Unknown database error',
                                message: 'PAN verification succeeded but failed to save to database'
                            }
                        },
                        res
                    );
                }
            } else if (response.data.Status === "Fail" || (response.data.Status === "Success" && response.data.data && !response.data.data.result)) {
                // Handle case where API succeeds but no PAN record found (result is null) or Status is Fail
                const apiData = response.data.data || response.data;
                
                logger.warn('PAN verification - No record found:', apiData.response_message || response.data.Status);

                return base.send_response(
                    apiData.response_message || "No Record Found",
                    {
                        request_id: apiData.request_id,
                        task_id: apiData.task_id,
                        group_id: apiData.group_id,
                        response_code: apiData.response_code,
                        response_message: apiData.response_message,
                        result: null,
                        billable: apiData.metadata?.billable,
                        request_timestamp: apiData.request_timestamp,
                        response_timestamp: apiData.response_timestamp,
                        database_save: {
                            status: 'Skipped',
                            message: 'No data to save - PAN record not found'
                        }
                    },
                    res,
                    200
                );
            } else {
                // Complete API failure case
                logger.error('PAN verification API failed:', response.data);
                return base.send_response(
                    "PAN verification failed",
                    {
                        status: response.data.Status,
                        details: response.data
                    },
                    res,
                    400
                );
            }

        } catch (error) {
            logger.error('PAN Pro Verification Error:', error);

            if (error.response) {
                const { status, data } = error.response;

                logger.error(`API Error Response - Status: ${status}, Data:`, data);

                if (status === 404) {
                    return base.send_response(
                        "PAN Pro verification service not found",
                        {
                            statusCode: 404,
                            suggestion: "Ensure your PAN Pro service is active",
                            details: data
                        },
                        res,
                        404
                    );
                } else if (status === 401 || status === 403) {
                    return base.send_response(
                        "Authentication failed",
                        {
                            statusCode: status,
                            suggestion: "Check your API credentials",
                            details: data
                        },
                        res,
                        401
                    );
                } else if (status === 400) {
                    return base.send_response(
                        "Bad request to PAN verification service",
                        {
                            statusCode: status,
                            suggestion: "Check request format and required fields",
                            details: data
                        },
                        res,
                        400
                    );
                } else if (status === 500) {
                    return base.send_response(
                        "Internal server error from PAN verification service",
                        {
                            statusCode: status,
                            details: data
                        },
                        res,
                        500
                    );
                } else {
                    return base.send_response(
                        `PAN verification API error: ${status}`,
                        {
                            statusCode: status,
                            details: data
                        },
                        res,
                        status
                    );
                }
            } else if (error.request) {
                logger.error('No response from PAN verification service:', error.request);
                return base.send_response(
                    "No response from PAN verification service",
                    {
                        error_type: "network_error",
                        details: "The request was sent but no response was received"
                    },
                    res,
                    500
                );
            } else {
                logger.error('PAN verification request setup error:', error.message);
                return base.send_response(
                    "Error setting up PAN verification request",
                    {
                        error_type: "setup_error",
                        details: error.message
                    },
                    res,
                    500
                );
            }
        }
    }


    async getPanDetails(req, res) {
        try {
            const { pancardno } = req.body;

            if (!pancardno) {
                return base.send_response(
                    "PAN card number is required",
                    null,
                    res,
                    400
                );
            }

            logger.info(`Retrieving PAN details for: ${pancardno}`);

            const [results] = await db.query(
                'SELECT * FROM pancard_detail WHERE pancardno = ? ORDER BY create_date DESC LIMIT 1',
                [pancardno]
            );

            if (results && results.length > 0) {
                const panRecord = results[0];

                // Parse the response JSON if it exists
                let parsedResponse = null;
                try {
                    parsedResponse = JSON.parse(panRecord.Response);
                } catch (parseError) {
                    logger.warn('Error parsing stored response JSON:', parseError);
                }

                return base.send_response(
                    "PAN details retrieved successfully",
                    {
                        id: panRecord.id,
                        pancardno: panRecord.pancardno,
                        fullname: panRecord.fullname,
                        create_date: panRecord.create_date,
                        stored_response: parsedResponse
                    },
                    res
                );
            } else {
                return base.send_response(
                    "No PAN details found for the given PAN number",
                    null,
                    res,
                    404
                );
            }

        } catch (error) {
            logger.error('Error retrieving PAN details:', error);
            return base.send_response(
                "Error retrieving PAN details",
                {
                    error: error.message
                },
                res,
                500
            );
        }
    }

    // Utility method to validate PAN format (can be used internally)
    validatePANFormat(pan) {
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        return panRegex.test(pan);
    }


    // Utility method to validate PAN format (can be used internally)
    validatePANFormat(pan) {
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        return panRegex.test(pan);
    }

    // Method to check API status (optional - for debugging)
    async checkAPIStatus(req, res) {
        try {
            const testPAN = 'IRZPS88XXX';
            const testResult = await this.performTestVerification(testPAN);

            return base.send_response(
                "API status check completed",
                {
                    api_status: testResult.success ? 'Connected' : 'Failed',
                    test_result: testResult
                },
                res
            );
        } catch (error) {
            logger.error('API status check failed:', error);
            return base.send_response(
                "API status check failed",
                {
                    api_status: 'Error',
                    error: error.message
                },
                res,
                500
            );
        }
    }


}

module.exports = new ZoopController();