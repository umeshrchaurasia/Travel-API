const nodemailer = require('nodemailer');
const base = require('../baseController');
const logger = require('../../bin/Logger');

const transporter = nodemailer.createTransport({
  host: 'smtp.znmail.co.in',
  port: 587,
  secure: false, // use TLS, not SSL
  auth: {
    user: 'no-reply@interstellar.co.in',
    pass: 'Norply@25!'
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false
  }
});

const MailSendController = {
  async sendTest(req, res) {
    try {
      const mailOptions = {
        from: '"Interstellar Services" <no-reply@interstellar.co.in>',
        to: req.body.to || 'recipient@example.com', // fallback
        subject: 'SMTP Test Mail',
        html: `<p>Hello, this is a test email from <strong>Interstellar SMTP</strong> using znmail SMTP with TLS.</p>`
      };

      const info = await transporter.sendMail(mailOptions);

      logger.info(`✅ Email sent successfully: ${info.messageId}`);
      return base.send_response("Email sent successfully", { messageId: info.messageId }, res, "Success", 200);
    } catch (error) {
      logger.error(`❌ Email sending failed: ${error.message}`);
      return base.send_response("Failed to send email", { error: error.message }, res, "Error", 500);
    }
  }
};

module.exports = MailSendController;
