// controller/VerificationController.js

const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');
const path = require('path');

class OTPVerificationController {
    /**
     * Render OTP verification page
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async renderVerificationPage(req, res) {
        try {
            const { email, agentId } = req.query;
            
            // Validate inputs
            if (!email || !agentId) {
                return res.status(400).send('Email and Agent ID are required');
            }
            
            // Render the verification page
            res.sendFile(path.join(__dirname, '../public/verification.html'));
        } catch (error) {
            logger.error(`Error rendering verification page: ${error.message}`);
            res.status(500).send('Server error occurred. Please try again later.');
        }
    }

    /**
     * Render verification success page
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async renderSuccessPage(req, res) {
        try {
            res.sendFile(path.join(__dirname, '../public/verification-success.html'));
        } catch (error) {
            logger.error(`Error rendering success page: ${error.message}`);
            res.status(500).send('Server error occurred. Please try again later.');
        }
    }

    /**
     * Verify OTP
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async verifyOtp(req, res) {
        try {
            const { email, otp, agentId } = req.body;

            // Validate inputs
            if (!email || !otp || !agentId) {
                return base.send_response(
                    "Email, OTP, and Agent ID are required",
                    null,
                    res,
                    "Error",
                    400
                );
            }

            // Call the stored procedure which returns the result directly
            const [results] = await db.query(
                'CALL VerifyAgentOTP(?, ?, ?)',
                [email, otp, agentId]
            );

            // The first element of the results array contains our procedure results
            const procedureResult = results[0][0];
            
            if (!procedureResult) {
                throw new Error('Failed to get stored procedure output');
            }

            const isValid = procedureResult.is_valid === 1;
            const message = procedureResult.message;

            if (isValid) {
                return base.send_response(
                    message,
                    { email, agentId },
                    res,
                    "Success",
                    200
                );
            } else {
                return base.send_response(
                    message,
                    null,
                    res,
                    "Error",
                    400
                );
            }
        } catch (error) {
            logger.error(`Error verifying OTP: ${error.message}`);
            return base.send_response(
                "Failed to verify OTP",
                { error: error.message },
                res,
                "Error",
                500
            );
        }
    }
}

module.exports = new OTPVerificationController();