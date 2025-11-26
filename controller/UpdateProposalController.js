// controller/BatchPaymentController.js
const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');

class UpdateProposalController {
    // Get proposal details by agent and payment status
    async getUpdateProposalDetailsByAgent(req, res) {
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
                'CALL getUpdateProposalDetailsByAgent(?, ?)',
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

    async getPolicyDetailsbyPolicyno(req, res) {
        try {
            const { Policyno } = req.body;

            // Input validation
            if (!Policyno) {
                return base.send_response(
                    "Policy No is required",
                    null,
                    res,
                    400
                );
            }

            // Call stored procedure
            const [rows] = await db.query(
                'CALL getPolicyDetailsbyPolicyno(?)',
                [Policyno]
            );

            // Get the result rows
            const results = rows[0];

            if (results && results.length > 0) {
                // Successful query
                base.send_response(
                    "Policy details retrieved successfully",
                    {
                        count: results.length,
                        proposals: results
                    },
                    res
                );
            } else {
                // No results found
                base.send_response(
                    "No Policy found for the given criteria",
                    {
                        count: 0,
                        proposals: []
                    },
                    res
                );
            }
        } catch (error) {
            logger.error('getPolicyDetailsbyPolicyno error:', error);
            base.send_response(
                "Error retrieving policy details",
                null,
                res,
                500
            );
        }
    }


    // Add this to your UpdateProposalController.js

    async updateProposal_policy(req, res) {
        try {
            const {
                proposal_id, PolicyNo,
                AddressLine1, AddressLine2, CityName, PinCode, State,
                EmailID, MobileNumber, LandLineNumber,
                IsRegGST, Cust_GSTINNO,
                InsuredFirstName, InsuredMiddleName, InsuredLastName, InsuredGender, PassportNo,
                NomineeName, RelationshipOfTheNomineeWithInsured

            } = req.body;

            // Input validation
            if (!proposal_id && !PolicyNo) {
                return base.send_response(
                    "Either Proposal ID or Policy Number is required",
                    null,
                    res,
                    400
                );
            }

            logger.info(`Updating proposal: ${proposal_id || PolicyNo}`);

            try {
                // Call stored procedure to update proposal
                const [results] = await db.query(
                    'CALL UpdateProposal_Policy(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)',
                    [
                        proposal_id || null,
                        PolicyNo || null,
                        AddressLine1 || null,
                        AddressLine2 || null,
                        CityName || null,
                        PinCode || null,
                        State || null,
                        EmailID || null,
                        MobileNumber || null,
                        LandLineNumber || null,
                        IsRegGST || null,
                        Cust_GSTINNO || null,
                        InsuredFirstName || null,
                        InsuredMiddleName || null,
                        InsuredLastName || null,
                        InsuredGender || null,
                        PassportNo || null,
                        NomineeName || null,
                        RelationshipOfTheNomineeWithInsured || null

                    ]
                );

                // Get first row of result if available
                const result = results[0] && results[0][0];

                if (result && result.Result === 'Success') {
                    logger.info(`Successfully updated proposal ${proposal_id || PolicyNo}`);

                    base.send_response(
                        "Proposal updated successfully",
                        {
                            proposal_id: result.proposal_id || proposal_id,
                            PolicyNo: result.PolicyNo || PolicyNo
                        },
                        res
                    );
                } else {
                    logger.error(`Failed to update proposal ${proposal_id || PolicyNo}`);

                    base.send_response(
                        "Proposal update failed",
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
            logger.error('UpdateProposal error:', error);
            base.send_response(
                "Error updating proposal",
                null,
                res,
                500
            );
        }
    }

    async getProposalDetailsByEmployee(req, res) {
        try {
            const { empId, startdate, enddate } = req.body;

            // Input validation
            if (!empId) {
                return base.send_response(
                    "Employee ID is required",
                    null,
                    res,
                    400
                );
            }

            // Call stored procedure
            const [rows] = await db.query(
                'CALL getProposalDetailsByEmployee(?,?,?)',
                [empId, startdate, enddate]
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
            logger.error('geteProposalDetailsByEmployee error:', error);
            base.send_response(
                "Error retrieving proposal details",
                null,
                res,
                500
            );
        }
    }



    // MIS Excel Dynamic filter: employee / agent / admin
    async getProposalMIS(req, res) {
        try {
            const { startdate, enddate, empId, agentId } = req.body;

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
                'CALL getProposal_MIS(?, ?, ?, ?)',
                [startdate, enddate, empId || null, agentId || null]
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


       // TDS Excel Dynamic filter:  agent / admin
    async getProposalTDS(req, res) {
        try {
            const { startdate, enddate, empId, agentId } = req.body;

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
                'CALL getProposal_TDS(?, ?, ?, ?)',
                [startdate, enddate, empId || null, agentId || null]
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


      async getProposalMIS_Practo(req, res) {
        try {
            const { startdate, enddate, empId, agentId } = req.body;

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
                'CALL getProposal_MIS_Practo(?, ?, ?, ?)',
                [startdate, enddate, empId || null, agentId || null]
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


      async getProposalTDS_Practo(req, res) {
        try {
            const { startdate, enddate, empId, agentId } = req.body;

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
                'CALL getProposalTDS_Practo(?, ?, ?, ?)',
                [startdate, enddate, empId || null, agentId || null]
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

    // Sub Agent MIS 

     // MIS Excel Dynamic filter: employee / agent / admin
    async getProposalMIS_SubAgent(req, res) {
        try {
            const { startdate, enddate, empId, agentId } = req.body;

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
                'CALL getSubAgent_byAgent_MIS(?, ?, ?, ?)',
                [startdate, enddate, empId || null, agentId || null]
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


       // TDS Excel Dynamic filter:  agent / admin
    async getProposalTDS_SubAgent(req, res) {
        try {
            const { startdate, enddate, empId, agentId } = req.body;

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
                'CALL getProposal_TDS_byAgent_MIS(?, ?, ?, ?)',
                [startdate, enddate, empId || null, agentId || null]
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

    //Admin
    

      async getSub_Main_AgentMIS_byAdmin(req, res) {
        try {
            const { startdate, enddate, empId, agentId } = req.body;

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
                'CALL getSub_Main_AgentMIS_byAdmin(?, ?, ?, ?)',
                [startdate, enddate, empId || null, agentId || null]
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

module.exports = new UpdateProposalController();




