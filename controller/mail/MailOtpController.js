
const db = require('../../bin/dbconnection');
const base = require('../baseController');
const nodemailer = require('nodemailer');
const logger = require('../../bin/Logger');



// Define these functions at the module level
/**
 * Generate a random 4-digit OTP
 * @returns {string} - 4-digit OTP
 */
function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Save OTP to database
 */
async function saveOtpToDatabase(email, agentId, otp) {
  // Set current timestamp
  const currentTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

  try {
    // Try to update existing record
    const [updateResult] = await db.query(
      'UPDATE otp_table SET otp = ?, created_at = ?, is_used = 0, status = "active" WHERE email = ? AND AgentId = ?',
      [otp, currentTimestamp, email, agentId]
    );

    // If no rows were affected (no existing record), insert a new one
    if (updateResult.affectedRows === 0) {
      await db.query(
        'INSERT INTO otp_table (email, otp, AgentId, created_at, is_used, status) VALUES (?, ?, ?, ?, 0, "active")',
        [email, otp, agentId, currentTimestamp]
      );
      logger.info(`Created new OTP record for email: ${email}, Agent ID: ${agentId}`);
    } else {
      logger.info(`Updated existing OTP record for email: ${email}, Agent ID: ${agentId}`);
    }
    return true;
  } catch (error) {
    logger.error(`Database error in saveOtpToDatabase: ${error.message}`);
    throw error;
  }
}

/**
 * Get agent details from database
 */
async function getAgentDetails(agentId) {
  try {
    const [agentRows] = await db.query(
      'SELECT FullName, Agent_Code FROM Agent_mst WHERE AgentId = ?',
      [agentId]
    );

    return {
      name: agentRows && agentRows.length > 0 ? agentRows[0].FullName : "Agent",
      code: agentRows && agentRows.length > 0 ? agentRows[0].Agent_Code : ""
    };
  } catch (error) {
    logger.error(`Error getting agent details: ${error.message}`);
    return { name: "Agent", code: "" };
  }
}

// Create SMTP transporter
let transporter;

// Try several common SMTP configurations
function setupSMTP() {
  // Let's try with SSL on port 465 since port 587 was refused
  const config = {
    host: 'smtp.znmail.co.in', // Your SMTP server
    port: 587, // Changed to 465 for SSL
    secure: false, // true for SSL
    auth: {
      user: 'no-reply@interstellar.co.in',
      pass: 'Norply@25!'
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false
    }
  };

  transporter = nodemailer.createTransport(config);

  logger.info('SMTP transporter created with SSL configuration');
}

// Initialize the transporter
setupSMTP();

// Verify SMTP connection on startup
(async function () {
  try {
    // Verify connection configuration
    await transporter.verify();
    logger.info('SMTP connection verified successfully! Server is ready to send emails.');
  } catch (error) {
    logger.error(`SMTP connection failed: ${error.message}`);
    logger.error('Email functionality will be disabled. OTPs will still be saved to the database.');
  }
})();

// Controller methods as standalone functions
const MailOtpController = {
  /**
   * Send OTP to email and save to database
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async sendOtp(req, res) {
    try {
      // Extract email and agentId from request body
      const { email, agentId } = req.body;

      // Validate inputs
      if (!email || !email.includes('@')) {
        return base.send_response(
          "Valid email is required",
          null,
          res,
          "Error",
          400
        );
      }

      if (!agentId) {
        return base.send_response(
          "Agent ID is required",
          null,
          res,
          "Error",
          400
        );
      }

      // Generate OTP
      const otp = generateOTP();

      logger.info(`Generated OTP ${otp} for email: ${email}, Agent ID: ${agentId}`);

      // First save OTP to database
      try {
        await saveOtpToDatabase(email, agentId, otp);

        // Get agent details
        const agent = await getAgentDetails(agentId);

        // Create verification link - use BASE_URL from environment or default to localhost
   
        //   const baseUrl = process.env.BASE_URL || 'http://inv.policyboss.com'; // test - http://localhost:3000
       
       // const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      
        const baseUrl = 'http://zextratravelassist.interstellar.co.in/travel-api';   // live

        // Create verification link without OTP - user will enter OTP manually
        const verificationLink = `${baseUrl}/verification.html?email=${encodeURIComponent(email)}&agentId=${encodeURIComponent(agentId)}`;

        // Try to send email
        try {
          // Create HTML email content with verification link
          const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
              <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0;">
                <h2 style="color: #333; margin-top: 0;">Welcome to Zextra Travel Assistance Service</h2>
              </div>
              <div style="padding: 20px 0;">
                <p style="font-size: 16px; color: #555;">Hello ${agent.name},</p>
                <p style="font-size: 16px; color: #555;">Your agent account has been successfully created.</p>
                <p style="font-size: 16px; color: #555;"><strong>Agent Code:</strong> ${agent.code}</p>
                <p style="font-size: 16px; color: #555;">Your one-time verification code is:</p>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; text-align: center; margin: 20px 0;">
                  <h1 style="color: #4285f4; margin: 0; letter-spacing: 5px; font-size: 32px;">${otp}</h1>
                </div>
                
                <p style="font-size: 16px; color: #555;">To verify your agent account, please click the button below:</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${verificationLink}" style="background-color: #6c63ff; padding: 12px 24px; color: white; border-radius: 4px; text-decoration: none;">
                    Verify Agent Account
                  </a>
                </div>
                <p style="font-size: 16px; color: #555;">You'll need to enter the verification code shown above when prompted.</p>
              
                <p style="font-size: 16px; color: #555;">If you did not register for this account, please ignore this email.</p>
              </div>
              <div style="padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #777; font-size: 12px;">
                <p>This is an automated email. Please do not reply.</p>
                <p>&copy; ${new Date().getFullYear()} Interstellar Services Pvt. Ltd., All rights reserved</p>
              </div>
            </div>
          `;

          // Send the email
          const info = await transporter.sendMail({
            from: 'Travel Assistance Service <no-reply@interstellar.co.in>',
            to: email,
            subject: 'Your Agent Account and Verification Code',
            html: htmlContent
          });

          logger.info(`Email sent successfully: ${info.messageId}`);

          // Return success
          return base.send_response(
            "OTP generated, saved, and sent to your email",
            { email, agentId },
            res,
            "Success",
            200
          );
        } catch (emailError) {
          // If email fails but database save was successful
          logger.error(`Email sending failed: ${emailError.message}`);

          // Return success with OTP for testing since email failed
          return base.send_response(
            "OTP generated and saved, but email sending failed. Use this OTP for testing:",
            {
              email,
              agentId,
              testOtp: otp,
              verificationLink // Include verification link for testing
            },
            res,
            "Success",
            200
          );
        }
      } catch (dbError) {
        logger.error(`Database error: ${dbError.message}`);
        return base.send_response(
          "Database error while saving OTP",
          { error: dbError.message },
          res,
          "Error",
          500
        );
      }
    } catch (error) {
      logger.error(`Error in sendOtp: ${error.message}`);
      return base.send_response(
        "Error processing OTP request",
        { error: error.message },
        res,
        "Error",
        500
      );
    }
  },

  /**
   * Test SMTP connection
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async testSmtpConnection(req, res) {
    try {
      await transporter.verify();
      return base.send_response(
        "SMTP connection is working correctly",
        { status: "success" },
        res,
        "Success",
        200
      );
    } catch (error) {
      logger.error(`SMTP test failed: ${error.message}`);
      return base.send_response(
        "SMTP connection failed",
        {
          status: "error",
          error: error.message,
          details: error.stack
        },
        res,
        "Error",
        500
      );
    }
  },

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

      logger.info(`Verifying OTP for email: ${email}, OTP: ${otp}, Agent ID: ${agentId}`);

      // Call the stored procedure to verify OTP
      const [results] = await db.query(
        'CALL VerifyAgentOTP(?, ?, ?)',
        [email, otp, agentId]
      );

      // The first element of the results array contains our procedure results
      const procedureResult = results[0][0];
      
      if (!procedureResult) {
        throw new Error('Failed to get stored procedure output');
      }

      logger.info(`Procedure result: ${JSON.stringify(procedureResult)}`);

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
  },

  /**
   * Resend OTP
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async resendOtp(req, res) {
    return await this.sendOtp(req, res);
  }
};

// Fix the resendOtp to call sendOtp directly, not through this
MailOtpController.resendOtp = MailOtpController.sendOtp;

module.exports = MailOtpController;