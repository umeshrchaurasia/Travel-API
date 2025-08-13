// controller/ProposalController.js
const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');

const axios = require('axios');

class ProposalController {
    // Insert Proposal
    async insertProposal(req, res) {
        try {
            const {
                AgentId,
                Product_Code,
                AgentCode_BASCode,
                UserName,
                EncryptedPassword,
                IntermediatoryBranchCode,
                IntermediatoryDepartmentName,
                AddressLine1,
                AddressLine2,
                CityName,
                PinCode,
                State,
                EmailID,
                MobileNumber,
                LandLineNumber,
                NameofPlan,
                PolicyStartDate,
                PolicyEndDate,
                BusinessType,
                PSONumber,
                SenderName,
                CountryVisiting,
                StateVisit,
                City_Of_visit,
                IsRegGST,
                Cust_GSTINNO,
                PaxId,
                InsuredFirstName,
                InsuredMiddleName,
                InsuredLastName,
                InsuredGender,
                PassportNo,
                IdentificationNo,
                NomineeName,
                RelationshipOfTheNomineeWithInsured,
                DateOfBirth,
                AgeGroup,
                SufferingFromAnyPreExistingDisease,
                NameOfDiseases,
                AddressOfTheHome,
                Certificate_Number,
                Download_Insurance,
                // Use these parameter names to match your stored procedure
                Selected_Payment_Mode,
                Selected_PremiumAmount,
                PlanAmount,
                ReliancePremiumAmount,
                Actual_PremiumAmount
            } = req.body;

            // Log the request data to help with debugging
            console.log('Request data:', JSON.stringify(req.body, null, 2));

            // Validate required fields
            if (!Product_Code || !AgentCode_BASCode || !UserName) {
                return base.send_response(
                    "Missing required fields",
                    null,
                    res,
                    "Error",
                    1
                );
            }

            // Call the stored procedure with parameter names matching your procedure
            const [result] = await db.query(
                'CALL sp_InsertProposal(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [
                    AgentId,
                    Product_Code,
                    AgentCode_BASCode,
                    UserName,
                    EncryptedPassword,
                    IntermediatoryBranchCode,
                    IntermediatoryDepartmentName,
                    AddressLine1,
                    AddressLine2,
                    CityName,
                    PinCode,
                    State,
                    EmailID,
                    MobileNumber,
                    LandLineNumber,
                    NameofPlan,
                    PolicyStartDate,
                    PolicyEndDate,
                    BusinessType,
                    PSONumber,
                    SenderName,
                    CountryVisiting,
                    StateVisit,
                    City_Of_visit,
                    IsRegGST,
                    Cust_GSTINNO,
                    PaxId,
                    InsuredFirstName,
                    InsuredMiddleName,
                    InsuredLastName,
                    InsuredGender,
                    PassportNo,
                    IdentificationNo,
                    NomineeName,
                    RelationshipOfTheNomineeWithInsured,
                    DateOfBirth,
                    AgeGroup,
                    SufferingFromAnyPreExistingDisease,
                    NameOfDiseases,
                    AddressOfTheHome,
                    Certificate_Number,
                    Download_Insurance,
                    Selected_Payment_Mode || "",  // Use the correct parameter names
                    Selected_PremiumAmount || "",
                    PlanAmount || "",
                    ReliancePremiumAmount || "0",
                    Actual_PremiumAmount || "0"
                ]
            );

            console.log('Stored procedure result:', JSON.stringify(result, null, 2));

            const procedureResult = result[0][0];

            base.send_response(
                procedureResult.message || "Proposal inserted successfully",
                procedureResult,
                res,
                procedureResult.status || "Success",
                0
            );

        } catch (error) {
            // Enhanced error logging
            logger.error('Error in insertProposal:', error);
            console.error('Full error details:', error);
            console.error('SQL error:', error.sqlMessage || 'No SQL message');
            console.error('Error stack:', error.stack);

            base.send_response(
                "Error inserting proposal: " + (error.message || "Unknown error"),
                null,
                res,
                "Error",
                1
            );
        }
    }

    // Get Proposal by Identification Number
    async getProposalByPassport(req, res) {
        try {
            const passportNo = req.query.passportpassportno || req.body.passportpassportno;

            if (!passportNo) {
                return base.send_response(
                    "Passport number is required",
                    null,
                    res,
                    "Error",
                    1
                );
            }

            const [rows] = await db.query(
                'CALL sp_GetProposalBypassport(?)',
                [passportNo]
            );

            if (rows[0] && rows[0].length > 0) {
                base.send_response(
                    "Proposal retrieved successfully",
                    rows[0],
                    res,
                    "Success",
                    0
                );
            } else {
                base.send_response(
                    "No proposal found with this passport number",
                    [],
                    res,
                    "Success",
                    0
                );
            }

        } catch (error) {
            logger.error('Error in getProposalBypassportnumber:', error);
            base.send_response(
                "Error retrieving proposal",
                null,
                res,
                "Error",
                1
            );
        }
    }

    // Reliance API proxy endpoint
    async getproxyreliancevalidation(req, res) {
        try {
            const response = await axios.post(
                'https://xpas.reliancegeneral.co.in/XPAS_TravelWebAPI/api/XpasPolicyInsurance/PostTravelPolicyDataValidation',
                req.body,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            res.json(response.data);
        } catch (error) {
            logger.error('Error forwarding to Reliance API:', error);
            // Send a formatted error response
            res.status(500).json({
                Status: 'Error',
                Message: error.message || 'Failed to connect to Reliance API',
                CustomerDetails: [{
                    WebServiceReturnStatus: 'Error',
                    ErrorCode: error.code || 'UNKNOWN_ERROR',
                    Error_Message: error.message || 'Failed to connect to Reliance API'
                }]
            });
        }
    }


    async insertCancelPolicy(req, res) {
        try {
            const {
                policyNo,     
                UID,          
                Name,        
                AgentId,     
                proposal_id, 
                Premium      
            } = req.body;

            // Validate inputs
            if (!policyNo || !UID || !Name || !AgentId || !proposal_id || !Premium) {
                return base.send_response(
                    "Missing required fields: policyNo, UID, Name, AgentId, proposal_id, Premium",
                    null,
                    res,
                    400
                );
            }

            logger.info(`Cancelling policy: ${policyNo}, proposal_id: ${proposal_id}`);

            // Call stored procedure
            await db.query(
                'CALL insert_cancel_policy(?, ?, ?, ?, ?, ?)',
                [policyNo, UID, Name, AgentId, proposal_id, Premium]
            );

            base.send_response(
                "Policy cancelled successfully",
                {
                    policyNo,
                    proposal_id,
                    cancelledBy: UID,
                    agentId: AgentId
                },
                res
            );
        } catch (error) {
            logger.error('insertCancelPolicy error:', error);
            base.send_response("Error cancelling policy", null, res, 500);
        }
    }

}

module.exports = new ProposalController();