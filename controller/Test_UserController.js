const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');

class Test_UserController {


    async testuserinsert(req, res) {
        try {
            const {
                fullname,
                mobile,
                email,
                street,
                city,
                state,
                pincode,
                country,
                gender,
                dob,
                occupation,
                company,
                marital_status
            } = req.body;

            console.log(req.body);
            // Ensure required fields are provided
            if (!fullname || !mobile || !email) {
                return res.status(400).json({ message: "Fullname, mobile, and email are required" });
            }

            const [result] = await db.query(
                'CALL InsertTestUser(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [fullname,
                    mobile,
                    email,
                    street,
                    city,
                    state,
                    pincode,
                    country,
                    gender,
                    dob,
                    occupation,
                    company,
                    marital_status,
                ]
            );

            console.log("Procedure Result:", result);
            const procedureResult = result?.[0]?.[0] || {};

            base.send_response(
                procedureResult.message || "User inserted successfully",
                procedureResult,
                res,
                procedureResult.status || "Success",
                0
            );

        } catch (error) {
            console.error("Error in User:", error);
            // logger.error("Error in User:", error);
            base.send_response("Error inserting User", null, res, "Error", 1);
        }
    }


    async gettestUserByEmail(req, res) {
        try {

            const emailid =  req.body.emailid// req.params.emailid;
           
            console.log(emailid);
            const [rows] = await db.query('CALL GetTestUserByEmail(?)', [emailid]);

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


module.exports = new Test_UserController();