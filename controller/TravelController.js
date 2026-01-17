const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');

class TravelController {
    // Get all employees
    async getEmployees(req, res) {
        try {
            const [rows] = await db.query('CALL get_emp()');
            base.send_response("Employees retrieved successfully", rows[0], res);
        } catch (error) {
            logger.error('Error in getEmployees:', error);
            base.send_response("Error retrieving employees", null, res);
        }
    }

    // Get users
    async getUsers(req, res) {
        try {
            const [rows] = await db.query('CALL get_emp()');
            base.send_response("Users retrieved successfully", rows[0], res);
        } catch (error) {
            base.send_response("Error retrieving users", null, res);
        }
    }

    // Get agents
    async getAgents_listbyEmp(req, res) {
        try {

            const UId = req.params.UId || req.query.UId || req.body.UId;

            if (!UId) {
                return base.send_response("Employee UId is required", null, res, 400);
            }

            const [rows] = await db.query('CALL get_agentlist(?)', [UId]);

            if (rows[0] && rows[0].length > 0) {
                base.send_response("Agents retrieved successfully", rows[0], res);
            } else {
                base.send_response("No record found for this employee", [], res);
            }


        } catch (error) {
            logger.error('Error in getAgentslist_byEmp:', error);
            base.send_response("Error retrieving agents", null, res);
        }
    }


    async getagents_listBy_Agent(req, res) {
        try {

            const agentId = req.params.agentId || req.query.agentId || req.body.agentId;

            if (!agentId) {
                return base.send_response("AgentId is required", null, res, 400);
            }

            const [rows] = await db.query('CALL get_agentlist_by_agent(?)', [agentId]);

            if (rows[0] && rows[0].length > 0) {
                base.send_response("Agents retrieved successfully", rows[0], res);
            } else {
                base.send_response("No record found for this employee", [], res);
            }


        } catch (error) {
            logger.error('Error in getAgentslist_byEmp:', error);
            base.send_response("Error retrieving agents", null, res);
        }
    }




    // Insert employee

    async insertEmployee(req, res) {
        try {
            const {
                UId,
                FullName,
                Password,
                EmailID,
                MobileNumber
            } = req.body;

            // Validate required fields
            if (!UId || !FullName || !Password || !EmailID) {
                return base.send_response(
                    "Missing required fields",
                    null,
                    res,
                    "Error",
                    1
                );
            }

            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(EmailID)) {
                return base.send_response(
                    "Invalid email format",
                    null,
                    res,
                    "Error",
                    1
                );
            }

            // Mobile number validation
            if (MobileNumber && !/^\d{10}$/.test(MobileNumber)) {
                return base.send_response(
                    "Invalid mobile number format",
                    null,
                    res,
                    "Error",
                    1
                );
            }

            // Call the stored procedure
            const [result] = await db.query(
                'CALL insert_employee(?, ?, ?, ?, ?)',
                [UId, FullName, Password, EmailID, MobileNumber]
            );

            // Check the result from stored procedure
            const procedureResult = result[0][0];

            base.send_response(
                procedureResult.Message || "Employee inserted successfully",
                procedureResult,
                res,
                procedureResult.Result || "Success",
                procedureResult.StatusNo || 0
            );

        } catch (error) {
            logger.error('Error in insertEmployee:', error);
            base.send_response(
                "Error inserting employee",
                null,
                res,
                "Error",
                1
            );
        }
    }

    // Insert Agent

    // Insert Agent - Updated method with enhanced duplicate validation
    async insertAgent(req, res) {
        try {
            const {
                UId,
                FullName,
                TraderName,
                Password,
                EmailID,
                MobileNumber,
                Gender,
                DOB,
                PayoutPercentage,
                PayoutPracto,
                PayoutAyush,
                PaymentMode,
                Wallet_Amount,
                EducationQualification,
                GST,
                Address,
                PAN_No,
                State,
            } = req.body;

            // Validate required fields
            if (!UId || !FullName || !Password || !EmailID) {
                return base.send_response(
                    "Missing required fields",
                    null,
                    res,
                    "Error",
                    1
                );
            }

            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(EmailID)) {
                return base.send_response(
                    "Invalid email format",
                    null,
                    res,
                    "Error",
                    1
                );
            }

            // Mobile number validation
            if (MobileNumber && !/^\d{10}$/.test(MobileNumber)) {
                return base.send_response(
                    "Invalid mobile number format",
                    null,
                    res,
                    "Error",
                    1
                );
            }

            const finalPayoutPracto = PayoutPracto ? PayoutPracto : '0';
            const finalPayoutAyush = PayoutAyush ? PayoutAyush : '0';

            // Call the stored procedure
            const [result] = await db.query(
                'CALL insert_Agent(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    UId,
                    FullName,
                    TraderName,
                    Password,
                    EmailID,
                    MobileNumber,
                    Gender,
                    DOB,
                    PayoutPercentage,
                    finalPayoutPracto,
                    finalPayoutAyush,
                    PaymentMode, // Now this variable is defined
                    Wallet_Amount,
                    EducationQualification,
                    GST,
                    Address,
                    PAN_No,
                    State
                ]
            );

            // Check the result from stored procedure
            const procedureResult = result[0][0];
            console.log('Procedure Result:', procedureResult);

            // Handle the response based on the Result field
            if (procedureResult.Result === 'Error') {
                // Return error response for duplicates or other errors
                return base.send_response(
                    procedureResult.Message || "Error creating agent",
                    null,
                    res,
                    "Error",
                    procedureResult.StatusNo || 1
                );
            } else {
                // Success response
                return base.send_response(
                    procedureResult.Message || "Agent created successfully",
                    {
                        AgentId: procedureResult.AgentId,
                        Agent_Code: procedureResult.Agent_Code,
                        FullName: FullName,
                        EmailID: EmailID,
                        MobileNumber: MobileNumber
                    },
                    res,
                    procedureResult.Result || "Success",
                    procedureResult.StatusNo || 0
                );
            }

        } catch (error) {
            logger.error('Error in insertAgent:', error);

            // Check if it's a MySQL duplicate entry error (additional safety)
            if (error.code === 'ER_DUP_ENTRY') {
                let duplicateField = 'field';
                if (error.sqlMessage.includes('EmailID')) {
                    duplicateField = 'email address';
                } else if (error.sqlMessage.includes('MobileNumber')) {
                    duplicateField = 'mobile number';
                }

                return base.send_response(
                    `This ${duplicateField} is already registered with another agent`,
                    null,
                    res,
                    "Error",
                    1
                );
            }

            base.send_response(
                "Error inserting Agent",
                null,
                res,
                "Error",
                1
            );
        }
    }

    // Login employee/Admin/Agent

    async loginForAll(req, res) {
        try {
            const { mobile, password } = req.body;

            // Validate required fields
            if (!mobile || !password) {
                return base.send_response(
                    "Mobile number and password are required",
                    null,
                    res,
                    400
                );
            }

            // Call stored procedure
            const [rows] = await db.query(
                'CALL sp_Login_forAll(?, ?)',
                [mobile, password]
            );

            // Get first row of result
            const result = rows[0][0];

            if (result.SuccessStatus === '1') {
                // Successful login
                if (result.EMPType === 'Agent') {
                    base.send_response(
                        "Login successful",
                        {
                            UId: result.UId,
                            AgentId: result.AgentId,
                            Agent_Code: result.Agent_Code,
                            FullName: result.FullName,
                            EmailID: result.EmailID,
                            MobileNumber: result.MobileNumber,
                            EMPType: result.EMPType,
                            Gender: result.Gender,
                            Admin_Approved: result.Admin_Approved,
                            Payout: result.Payout,
                            Paymentmode: result.Paymentmode
                        },
                        res
                    );
                }
                else {

                    base.send_response(
                        "Login successful",
                        {
                            UId: result.UId,
                            FullName: result.FullName,
                            EmailID: result.EmailID,
                            MobileNumber: result.MobileNumber,
                            EMPType: result.EMPType
                        },
                        res
                    );
                }

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


    // Get agents
    async GetAgentSummary(req, res) {
        try {

            const UId = req.params.UId || req.query.UId || req.body.UId;

            if (!UId) {
                return base.send_response("Employee UId is required", null, res, 400);
            }

            const [rows] = await db.query('CALL GetAgentSummary(?)', [UId]);

            if (rows[0] && rows[0].length > 0) {
                base.send_response("Agents retrieved successfully", rows[0], res);
            } else {
                base.send_response("No record found for this employee", [], res);
            }


        } catch (error) {
            logger.error('Error in getAgentslist_byEmp:', error);
            base.send_response("Error retrieving agents", null, res);
        }
    }

    async checkEmailDuplicate(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return base.send_response("Email is required", null, res, "Error", 1);
            }

            const [rows] = await db.query(
                'SELECT COUNT(*) as count FROM Agent_mst WHERE EmailID = ? AND isactive = 1',
                [email]
            );

            const isDuplicate = rows[0].count > 0;

            base.send_response(
                isDuplicate ? "Email already exists" : "Email available",
                { isDuplicate, email },
                res,
                "Success",
                0
            );

        } catch (error) {
            logger.error('Error checking email duplicate:', error);
            base.send_response("Error checking email", null, res, "Error", 1);
        }
    }

    async checkMobileDuplicate(req, res) {
        try {
            const { mobile } = req.body;

            if (!mobile) {
                return base.send_response("Mobile number is required", null, res, "Error", 1);
            }

            const [rows] = await db.query(
                'SELECT COUNT(*) as count FROM Agent_mst WHERE MobileNumber = ? AND isactive = 1',
                [mobile]
            );

            const isDuplicate = rows[0].count > 0;

            base.send_response(
                isDuplicate ? "Mobile number already exists" : "Mobile number available",
                { isDuplicate, mobile },
                res,
                "Success",
                0
            );

        } catch (error) {
            logger.error('Error checking mobile duplicate:', error);
            base.send_response("Error checking mobile number", null, res, "Error", 1);
        }
    }

    // Insert Agent - Updated method with enhanced duplicate validation

    async addAgent_nonkyc(req, res) {
        try {
            const {
                UId,
                FullName,
                TraderName,
                Password,
                EmailID,
                MobileNumber,
                Gender,
                DOB,
                PayoutPercentage,
                PayoutPracto,
                PayoutAyush,
                PaymentMode,
                Wallet_Amount,
                EducationQualification,
                GST,
                Address,
                PAN_No,
                State,
                Main_Agent
            } = req.body;

            // Validate required fields
            if (!UId || !FullName || !Password || !EmailID) {
                return base.send_response(
                    "Missing required fields",
                    null,
                    res,
                    "Error",
                    1
                );
            }

            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(EmailID)) {
                return base.send_response(
                    "Invalid email format",
                    null,
                    res,
                    "Error",
                    1
                );
            }

            // Mobile number validation
            if (MobileNumber && !/^\d{10}$/.test(MobileNumber)) {
                return base.send_response(
                    "Invalid mobile number format",
                    null,
                    res,
                    "Error",
                    1
                );
            }

            // Ensure numeric values for payouts default to '0' if missing
            const finalPayoutPracto = PayoutPracto || '0';
            const finalPayoutAyush = PayoutAyush || '0';

            // Call the stored procedure
            // Fixed the typo in the SQL string (removed extra space and ensured 19 placeholders)
            const [result] = await db.query(
                'CALL insert_Agent_nonkyc(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    UId || '',
                    FullName || '',
                    TraderName || '',
                    Password || '',
                    EmailID || '',
                    MobileNumber || '',
                    Gender || 'Male',
                    DOB || '',
                    PayoutPercentage || '',
                    finalPayoutPracto,
                    finalPayoutAyush,
                    PaymentMode || 'Full Pay',
                    Wallet_Amount || '0',
                    EducationQualification || '',
                    GST || '',
                    Address || '',
                    PAN_No || '',
                    State || '',
                    Main_Agent || ''
                ]
            );

            // Check the result from stored procedure
            const procedureResult = result[0][0];
            // console.log('Procedure Result:', procedureResult);

            // Handle the response based on the Result field
            if (procedureResult.Result === 'Error') {
                return base.send_response(
                    procedureResult.Message || "Error creating agent",
                    null,
                    res,
                    "Error",
                    procedureResult.StatusNo || 1
                );
            } else {
                return base.send_response(
                    procedureResult.Message || "Agent created successfully",
                    {
                        AgentId: procedureResult.AgentId,
                        Agent_Code: procedureResult.Agent_Code,
                        FullName: FullName,
                        EmailID: EmailID,
                        MobileNumber: MobileNumber
                    },
                    res,
                    procedureResult.Result || "Success",
                    procedureResult.StatusNo || 0
                );
            }

        } catch (error) {
            logger.error('Error in addAgent_nonkyc:', error);

            if (error.code === 'ER_DUP_ENTRY') {
                let duplicateField = 'field';
                if (error.sqlMessage.includes('EmailID')) {
                    duplicateField = 'email address';
                } else if (error.sqlMessage.includes('MobileNumber')) {
                    duplicateField = 'mobile number';
                }

                return base.send_response(
                    `This ${duplicateField} is already registered with another agent`,
                    null,
                    res,
                    "Error",
                    1
                );
            }

            base.send_response(
                "Error inserting Agent",
                null,
                res,
                "Error",
                1
            );
        }
    }

    async addAgent_kyc(req, res) {
        try {
            const {
                UId,
                FullName,
                TraderName,
                Password,
                EmailID,
                MobileNumber,
                Gender,
                DOB,
                PayoutPercentage,
                PayoutPracto,
                PayoutAyush,
                PaymentMode,
                Wallet_Amount,
                EducationQualification,
                GST,
                Address,
                PAN_No,
                State,
                Main_Agent
            } = req.body;

            // Validate required fields
            if (!UId || !FullName || !Password || !EmailID) {
                return base.send_response(
                    "Missing required fields",
                    null,
                    res,
                    "Error",
                    1
                );
            }

            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(EmailID)) {
                return base.send_response(
                    "Invalid email format",
                    null,
                    res,
                    "Error",
                    1
                );
            }

            // Mobile number validation
            if (MobileNumber && !/^\d{10}$/.test(MobileNumber)) {
                return base.send_response(
                    "Invalid mobile number format",
                    null,
                    res,
                    "Error",
                    1
                );
            }

            // Ensure numeric values for payouts default to '0' if missing
            const finalPayoutPracto = PayoutPracto || '0';
            const finalPayoutAyush = PayoutAyush || '0';

            // Call the stored procedure
            // Ensured 19 placeholders correspond to the array below
            const [result] = await db.query(
                'CALL insert_Agent_kyc(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    UId || '',
                    FullName || '',
                    TraderName || '',
                    Password || '',
                    EmailID || '',
                    MobileNumber || '',
                    Gender || 'Male',
                    DOB || '',
                    PayoutPercentage || '',
                    finalPayoutPracto,
                    finalPayoutAyush,
                    PaymentMode || 'Full Pay',
                    Wallet_Amount || '0',
                    EducationQualification || '',
                    GST || '',
                    Address || '',
                    PAN_No || '',
                    State || '',
                    Main_Agent || ''
                ]
            );

            // Check the result from stored procedure
            const procedureResult = result[0][0];
            // console.log('Procedure Result:', procedureResult);

            // Handle the response based on the Result field
            if (procedureResult.Result === 'Error') {
                return base.send_response(
                    procedureResult.Message || "Error creating agent",
                    null,
                    res,
                    "Error",
                    procedureResult.StatusNo || 1
                );
            } else {
                return base.send_response(
                    procedureResult.Message || "Agent created successfully",
                    {
                        AgentId: procedureResult.AgentId,
                        Agent_Code: procedureResult.Agent_Code,
                        FullName: FullName,
                        EmailID: EmailID,
                        MobileNumber: MobileNumber
                    },
                    res,
                    procedureResult.Result || "Success",
                    procedureResult.StatusNo || 0
                );
            }

        } catch (error) {
            logger.error('Error in addAgent_kyc:', error);

            if (error.code === 'ER_DUP_ENTRY') {
                let duplicateField = 'field';
                if (error.sqlMessage.includes('EmailID')) {
                    duplicateField = 'email address';
                } else if (error.sqlMessage.includes('MobileNumber')) {
                    duplicateField = 'mobile number';
                }

                return base.send_response(
                    `This ${duplicateField} is already registered with another agent`,
                    null,
                    res,
                    "Error",
                    1
                );
            }

            base.send_response(
                "Error inserting Agent",
                null,
                res,
                "Error",
                1
            );
        }
    }

    // Get subagents
    async subagents_listByagent(req, res) {
        try {

            const agentId = req.params.agentId || req.query.agentId || req.body.agentId;

            if (!agentId) {
                return base.send_response("AgentId is required", null, res, 400);
            }

            const [rows] = await db.query('CALL get_subagentlist(?)', [agentId]);

            if (rows[0] && rows[0].length > 0) {
                base.send_response("Agents retrieved successfully", rows[0], res);
            } else {
                base.send_response("No record found for this employee", [], res);
            }


        } catch (error) {
            logger.error('Error in getAgentslist_byEmp:', error);
            base.send_response("Error retrieving agents", null, res);
        }
    }
}

module.exports = new TravelController();