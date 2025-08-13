const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');
const fs = require('fs');
const path = require('path');
const policyService = require('../services/PolicyService');

class PolicyGenerateController {
    constructor() {
        this.generatePolicybyPolicyno = this.generatePolicybyPolicyno.bind(this);
        this.generatePolicyHTML = this.generatePolicyHTML.bind(this);
        this.generateSamplePolicy = this.generateSamplePolicy.bind(this);
        this.checkOrGenerateASNumber = this.checkOrGenerateASNumber.bind(this);
    }

    // Method to check or generate AS number
    async checkOrGenerateASNumber(policyNumber, policyStartDate, policyEndDate, fullName, fullAddress, premiumAmount, emailID, mobileNumber, day_of_difference) {
        try {
            logger.info(`Checking or generating AS number for policy: ${policyNumber}`);

            // First check if AS number already exists
            const [existingRows] = await db.query('SELECT * FROM welcome_letter WHERE Certificate_Number = ?', [policyNumber]);

            if (existingRows && existingRows.length > 0) {
                // Use existing record
                const asNumber = existingRows[0].Asnumber;
                logger.info(`Found existing AS number: ${asNumber}`);
                return asNumber;
            } else {
                // Create new record with new AS number
                logger.info('No existing AS number found, creating new one');

                // Get next AS number
                const [numResults] = await db.query(
                    'SELECT IFNULL(MAX(CAST(SUBSTRING(Asnumber, 3) AS SIGNED)), 0) + 1 AS nextNum FROM welcome_letter'
                );

                const nextNum = numResults[0].nextNum || 1;
                const asNumber = 'AS' + String(nextNum).padStart(8, '0');

                // Format dates properly if they're Date objects
                const formattedStartDate = policyStartDate instanceof Date ?
                    policyStartDate.toISOString().split('T')[0] : policyStartDate;

                const formattedEndDate = policyEndDate instanceof Date ?
                    policyEndDate.toISOString().split('T')[0] : policyEndDate;

                // Insert new record with all the provided fields
                const [insertResult] = await db.query(
                    `INSERT INTO welcome_letter 
                (Certificate_Number, Asnumber, PolicyStartDate, PolicyEndDate, 
                fulladdress, fullname, PremiumAmount, EmailID, MobileNumber, travelDuration, Created_Date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [policyNumber, asNumber, formattedStartDate, formattedEndDate,
                        fullAddress, fullName, premiumAmount, emailID, mobileNumber, day_of_difference]
                );

                logger.info(`Created new AS number: ${asNumber}`);
                return asNumber;
            }
        } catch (error) {
            logger.error(`Error checking/generating AS number: ${error.message}`);
            throw error;
        }
    }

   // Updated part of PolicyGenerateController.js
async generatePolicybyPolicyno(req, res) {
    try {
        logger.info('API call received for generatePolicybyPolicyno');
        const { Policyno } = req.body;
        logger.info(`Policy number: ${Policyno}`);

        if (!Policyno) {
            logger.warn('Missing policy number in request');
            return base.send_response("Policy No is required", null, res, 400);
        }

        // Get policy details
        const [policyRows] = await db.query('CALL getPolicyDetailsbyPolicyno(?)', [Policyno]);
        const results = policyRows[0];

        logger.info(`Query results count: ${results ? results.length : 0}`);

        if (results && results.length > 0) {
            const policyData = results[0];
            logger.info(`Found policy data for ${Policyno}, generating documents`);

            // Get base amount from policy data - Add proper type handling
            // Convert to number to ensure consistent comparison
            const rawPlanAmount = policyData.PlanAmount;
            const baseAmount = parseInt(String(rawPlanAmount).replace(/,/g, ''), 10);
            
            logger.info(`Raw plan amount: ${rawPlanAmount}, Converted base amount: ${baseAmount}`);

            // Get coverage details from coverage_master table with better error handling
            try {
                // Try the query with the numeric base amount
                const [coverageRows] = await db.query(
                    'SELECT id, coverage, sum_insured FROM Traveldb.coverage_master WHERE base_amount = ?', 
                    [baseAmount]
                );
                
                logger.info(`Found ${coverageRows ? coverageRows.length : 0} coverage records for base amount ${baseAmount}`);
                
                // Add coverage details to policy data
                policyData.coverageDetails = coverageRows || [];
                
                // Log first few coverage items for verification
                if (coverageRows && coverageRows.length > 0) {
                    logger.info(`First coverage item: ${JSON.stringify(coverageRows[0])}`);
                }
                
                // If no coverage data found for this base amount, try a default
                if (!coverageRows || coverageRows.length === 0) {
                    logger.warn(`No coverage data found for base amount ${baseAmount}, using default 60000`);
                    
                    const [defaultCoverageRows] = await db.query(
                        'SELECT id, coverage, sum_insured FROM Traveldb.coverage_master WHERE base_amount = ?', 
                        [60000]
                    );
                    
                    policyData.coverageDetails = defaultCoverageRows || [];
                }
            } catch (coverageError) {
                logger.error(`Error fetching coverage details: ${coverageError.message}`);
                policyData.coverageDetails = []; // Set to empty array if error occurs
            }

            // Rest of the code remains the same...
            try {
                const fullName = [policyData.FirstName, policyData.MiddleName, policyData.LastName].filter(Boolean).join(' ');
                const fullAddress = [policyData.AddressLine1, policyData.AddressLine2, policyData.CityName, policyData.State, policyData.PinCode].filter(Boolean).join(', ');

                const asNumber = await this.checkOrGenerateASNumber(
                    Policyno,
                    policyData.PolicyStartDate,
                    policyData.PolicyEndDate,                        
                    fullName,
                    fullAddress,
                    policyData.PremiumAmount,
                    policyData.EmailID,
                    policyData.MobileNumber,
                    policyData.day_of_difference 
                );
                policyData.Asnumber = asNumber;
                logger.info(`Using AS Number: ${asNumber} for policy ${Policyno}`);
            } catch (asError) {
                logger.error(`Error getting AS number: ${asError.message}`);
                policyData.Asnumber = ''; // Set to empty string if error occurs
            }

            // Store the original plan amount separately
            policyData.originalPlanAmount = rawPlanAmount;
            
            // Generate PDF and related assets
            policyService.generatePolicy(Policyno, policyData, async (err, result) => {
                if (err) {
                    logger.error('Policy generation error:', err);
                    return base.send_response("Error generating policy documents: " + err.message, { count: results.length, proposals: results }, res, 500);
                }

                const pdfUrl = '/policy/' + path.basename(result.pdfPath);
                const certificateId = Policyno;

                // Update proposal_main with pdfUrl
                try {
                    const updateQuery = `UPDATE proposal_main SET PolicypdfUrl = ? WHERE Certificate_Number = ?`;
                    const [updateResult] = await db.query(updateQuery, [pdfUrl, certificateId]);

                    if (updateResult.affectedRows > 0) {
                        logger.info(`Successfully updated proposal_main for certificate: ${certificateId}`);
                    } else {
                        logger.warn(`No rows updated in proposal_main for certificate: ${certificateId}`);
                    }
                } catch (updateError) {
                    logger.error(`Error updating PolicypdfUrl: ${updateError}`);
                }

                // Final response
                logger.info(`Successfully generated documents for policy ${Policyno}`);
                base.send_response(
                    "Policy documents generated successfully",
                    {
                        count: results.length,
                        proposals: results,
                        pdfUrl,
                        qrCodeUrl: result.qrCodePath.replace('./public', ''),
                        asNumber: result.processedData.Asnumber
                    },
                    res
                );
            });
        } else {
            logger.warn(`No policy found for ${Policyno}`);
            base.send_response("No Policy found for the given criteria", { count: 0, proposals: [] }, res);
        }
    } catch (error) {
        logger.error('generatePolicybyPolicyno error:', error);
        base.send_response("Error retrieving policy details: " + (error.message || error), null, res, 500);
    }
}

    async generatePolicyHTML(req, res) {
        try {
            logger.info('API call received for generatePolicyHTML');
            const { Policyno } = req.body;
            logger.info(`Policy number for HTML: ${Policyno}`);

            if (!Policyno) {
                logger.warn('Missing policy number in HTML request');
                return base.send_response("Policy No is required", null, res, 400);
            }

            // Get policy details
            const [policyRows] = await db.query('CALL getPolicyDetailsbyPolicyno(?)', [Policyno]);
            const results = policyRows[0];

            logger.info(`Query results count for HTML: ${results ? results.length : 0}`);

            if (results && results.length > 0) {
                const policyData = results[0];
                logger.info(`Found policy data for ${Policyno}, generating HTML`);

                // Get base amount from policy data
                const baseAmount = policyData.PlanAmount;
                logger.info(`Using base amount: ${baseAmount} for coverage lookup`);

                // Get coverage details from coverage_master table
                try {
                    const [coverageRows] = await db.query(
                        'SELECT id, coverage, sum_insured FROM Traveldb.coverage_master WHERE base_amount = ?', 
                        [baseAmount]
                    );
                    
                    logger.info(`Found ${coverageRows ? coverageRows.length : 0} coverage records for base amount ${baseAmount}`);
                    
                    // Add coverage details to policy data
                    policyData.coverageDetails = coverageRows || [];
                } catch (coverageError) {
                    logger.error(`Error fetching coverage details: ${coverageError.message}`);
                    policyData.coverageDetails = []; // Set to empty array if error occurs
                }

                // Get or generate AS number
                try {
                    const fullName = [policyData.FirstName, policyData.MiddleName, policyData.LastName].filter(Boolean).join(' ');
                    const fullAddress = [policyData.AddressLine1, policyData.AddressLine2, policyData.CityName, policyData.State, policyData.PinCode].filter(Boolean).join(', ');

                    const asNumber = await this.checkOrGenerateASNumber(
                        Policyno,
                        policyData.PolicyStartDate,
                        policyData.PolicyEndDate,                        
                        fullName,
                        fullAddress,
                        policyData.PremiumAmount,
                        policyData.EmailID,
                        policyData.MobileNumber,
                        policyData.day_of_difference 
                    );
                    policyData.Asnumber = asNumber;
                    logger.info(`Using AS Number: ${asNumber} for policy ${Policyno}`);
                } catch (asError) {
                    logger.error(`Error getting AS number: ${asError.message}`);
                    policyData.Asnumber = ''; // Set to empty string if error occurs
                }

                logger.info(`Found ${policyData.coverageDetails.length} coverage details for base amount ${baseAmount}`);

                // Call the proper method in policyService
                policyService.generatePolicy(Policyno, policyData, (err, result) => {
                    if (err) {
                        logger.error('Policy HTML generation error:', err);
                        return base.send_response("Error generating policy HTML: " + err.message, { count: results.length, proposals: results }, res, 500);
                    }

                    logger.info(`Successfully generated HTML for policy ${Policyno}`);
                    base.send_response(
                        "Policy HTML generated successfully",
                        {
                            count: results.length,
                            proposals: results,
                            htmlUrl: result.htmlPath.replace('./public', ''),
                            htmlContent: result.htmlContent ? result.htmlContent.substring(0, 300) + '...' : null,
                            asNumber: result.processedData.Asnumber
                        },
                        res
                    );
                });
            } else {
                logger.warn(`No policy found for HTML generation: ${Policyno}`);
                base.send_response("No Policy found for the given criteria", { count: 0, proposals: [] }, res);
            }
        } catch (error) {
            logger.error('generatePolicyHTML error:', error);
            base.send_response("Error retrieving policy details for HTML: " + (error.message || error), null, res, 500);
        }
    }

    async generateSamplePolicy(req, res) {
        logger.info('API call received for generateSamplePolicy');

        // Sample base amount to query coverage details
        const sampleBaseAmount = 60000;
        
        try {
            // Get coverage details based on the sample base amount
            const [coverageRows] = await db.query(
                'SELECT id, coverage, sum_insured FROM Traveldb.coverage_master WHERE base_amount = ?', 
                [sampleBaseAmount]
            );
            
            logger.info(`Found ${coverageRows ? coverageRows.length : 0} sample coverage records`);
            
            // Create a sample policy data with default values
            const samplePolicyData = {
                Policy_No: 'SAMPLE' + Date.now(),
                FirstName: 'John',
                MiddleName: '',
                LastName: 'Doe',
                AddressLine1: '123 Main Street',
                AddressLine2: 'Apartment 4B',
                CityName: 'Mumbai',
                State: 'Maharashtra',
                PinCode: '400001',
                PolicyStartDate: new Date(),
                PolicyEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
                Gender: 'Male',
                PassportNo: 'J1234567',
                NomineeName: 'Jane Doe',
                RelationshipOfTheNomineeWithInsured: 'Spouse',
                PlanAmount: sampleBaseAmount,
                // Add the coverage details from the database query
                coverageDetails: coverageRows || []
            };

            // Generate sample AS number for demo
            samplePolicyData.Asnumber = 'AS' + String(Math.floor(10000000 + Math.random() * 90000000));

            policyService.generatePolicy(samplePolicyData.Policy_No, samplePolicyData, (err, result) => {
                if (err) {
                    logger.error('Sample policy generation error:', err);
                    return base.send_response("Error generating sample policy: " + err.message, null, res, 500);
                }

                logger.info(`Successfully generated sample policy: ${result.processedData.Policy_No}`);
                base.send_response(
                    "Sample policy generated successfully",
                    {
                        policyNo: result.processedData.Policy_No,
                        pdfUrl: result.pdfPath.replace('./public', ''),
                        pdfExists: true,
                        asNumber: result.processedData.Asnumber
                    },
                    res
                );
            });
        } catch (error) {
            logger.error('Error generating sample policy:', error);
            base.send_response("Error generating sample policy: " + (error.message || error), null, res, 500);
        }
    }
}

module.exports = new PolicyGenerateController();