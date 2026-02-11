const db = require('../../bin/dbconnection');
const base = require('../baseController');
const nodemailer = require('nodemailer');
const logger = require('../../bin/Logger');

// SMTP Transporter setup 
let transporter;
function setupSMTP() {
    const config = {
        host: 'smtp.znmail.co.in',
        port: 587,
        secure: false,
        auth: {
            user: 'no-reply@interstellar.co.in',
            pass: 'Norply@25!'
        },
        tls: { ciphers: 'SSLv3', rejectUnauthorized: false }
    };
    transporter = nodemailer.createTransport(config);
}
setupSMTP();

const MailCustDetailController = {

    /**
     * Send Customer Details to Agent Email
     * @param {Object} req - Body contains AgentEmail and customerDetails
     */
    async sendCustomerDetailsMail(req, res) {
        try {
            const { AgentEmail, customerDetails } = req.body;

            if (!AgentEmail) throw new Error("AgentEmail is missing");

            // Simplified: Use the customerDetails provided by the caller
            const htmlContent = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
          <div style="background-color: #6c63ff; color: white; padding: 20px; text-align: center;">
            <h2 style="margin: 0;">New Customer Registration</h2>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Zextra Wellness Lead Notification</p>
          </div>
          <div style="padding: 25px; color: #444;">
            <p>Hello,</p>
            <p>A new customer has submitted their details through your referral link. Below are the details:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              <tr style="background-color: #f8f9fa;">
                <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Full Name</td>
                <td style="padding: 10px; border: 1px solid #eee;">${customerDetails.FirstName} ${customerDetails.LastName || ''}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Mobile</td>
                <td style="padding: 10px; border: 1px solid #eee;">${customerDetails.Mobile}</td>
              </tr>
              <tr style="background-color: #f8f9fa;">
                <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Email</td>
                <td style="padding: 10px; border: 1px solid #eee;">${customerDetails.Email}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">PAN Number</td>
                <td style="padding: 10px; border: 1px solid #eee;">${customerDetails.PanNumber || 'N/A'}</td>
              </tr>
              <tr style="background-color: #f8f9fa;">
                <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Pincode</td>
                <td style="padding: 10px; border: 1px solid #eee;">${customerDetails.Pincode || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Plan Selected</td>
                <td style="padding: 10px; border: 1px solid #eee; color: #6c63ff; font-weight: bold;">${customerDetails.PlanSelectionType}</td>
              </tr>
            </table>

            <p style="margin-top: 25px;">Please log in to your dashboard to view full lead details.</p>
          </div>
          <div style="background-color: #f4f4f4; padding: 15px; text-align: center; color: #888; font-size: 12px;">
            <p>This is an automated notification from Zextra Wellness.</p>
            <p>&copy; ${new Date().getFullYear()} Interstellar Services Pvt. Ltd.</p>
          </div>
        </div>
      `;

            const info = await transporter.sendMail({
                from: '"Zextra Wellness" <no-reply@interstellar.co.in>',
                to: AgentEmail,
                subject: `New Lead: ${customerDetails.FirstName} - ${customerDetails.PlanSelectionType}`,
                html: htmlContent
            });

            logger.info(`Customer details mail sent to ${AgentEmail}: ${info.messageId}`);

            if (res) {
                return base.send_response("Mail sent successfully", null, res, "Success", 200);
            }
        } catch (error) {
            logger.error(`Error in sendCustomerDetailsMail: ${error.message}`);
            if (res) {
                return base.send_response("Mail failed", error.message, res, "Error", 500);
            }
            throw error;
        }
    }
};

module.exports = MailCustDetailController;