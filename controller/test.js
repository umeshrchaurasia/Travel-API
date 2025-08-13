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

   async insertAgent(req, res) {
    try {
        const { 
            UId,
            FullName,
            Password,
            EmailID,
            MobileNumber,
            Gender,
            DOB  
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
            'CALL insert_Agent(?, ?, ?, ?, ?, ?, ?)',
            [UId, FullName, Password, EmailID, MobileNumber, Gender,DOB]
        );

        // Check the result from stored procedure
      
        const procedureResult = result[0][0];
        console.log(procedureResult);

        base.send_response(
            procedureResult.Message || "Agent created successfully",
            procedureResult,
            res,
            procedureResult.Result || "Success",
            procedureResult.StatusNo || 0
        );

    } catch (error) {
        logger.error('Error in insertAgent:', error);
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

   async loginForAll(req, res){
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




}

module.exports = new TravelController();