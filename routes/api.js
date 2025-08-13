// routes/api.js
const express = require('express');
const router = express.Router();
const db = require('../bin/dbconnection');
const base = require('../controller/baseController');
const wrapper = require('../controller/wrapper');

const travelController = require('../controller/TravelController');
const TravelDocController = require('../controller/TravelDocController');
const adminController = require('../controller/AdminController');

const agentController = require('../controller/AgentController');
// Initialize document controller
const documentController = new TravelDocController();
const proposalController = require('../controller/ProposalController');

//Test
const testuserController = require('../controller/Test_UserController');

//BatchPayment
const BatchPaymentController = require('../controller/BatchPaymentController');

const UpdateProposalController =  require('../controller/UpdateProposalController');

const razorPaymentController = require('../controller/RazorPaymentController');

const PolicyGenerateController = require('../controller/PolicyGenerateController');
//const PolicyGeneratorController1 = require('../controller/PolicyGeneratorController1');

const HtmlToPdfController  = require('../controller/HtmlToPdfController');


const InvoiceController = require('../controller/InvoiceController');

const MailOtpController = require('../controller/mail/MailOtpController');

const welcomeLetterController = require('../controller/welcomeLetterController');

const MailSendController = require('../controller/mail/MailSendController');

// Import the Verification Controller
const OTPVerificationController = require('../controller/OTPVerificationController');

const ZoopController = require('../controller/ZoopController');

// Add this line anywhere in the route block
router.post('/sendTestMail', wrapper.asyncHandler(MailSendController.sendTest));
// OTP routes
router.post('/sendOtp', wrapper.asyncHandler(MailOtpController.sendOtp));
router.post('/verifyOtp', wrapper.asyncHandler(MailOtpController.verifyOtp));
router.post('/resendOtp', wrapper.asyncHandler(MailOtpController.resendOtp));
router.get('/testSmtp', wrapper.asyncHandler(MailOtpController.testSmtpConnection));


// Employee routes
router.get('/employee_list', wrapper.asyncHandler(travelController.getEmployees));
router.post('/addemployee', wrapper.asyncHandler(travelController.insertEmployee));

// Login Employee 
router.post('/login', wrapper.asyncHandler(travelController.loginForAll));

// Agent routes
router.get('/agents_listByEmp', wrapper.asyncHandler(travelController.getAgents_listbyEmp));
router.get('/GetAgentSummary', wrapper.asyncHandler(travelController.GetAgentSummary));

router.post('/addagent', wrapper.asyncHandler(travelController.insertAgent));

router.post('/getPremium-including', wrapper.asyncHandler(agentController.getPremium_including));
router.post('/getPremium-excluding', wrapper.asyncHandler(agentController.getPremium_excluding));
router.post('/get_agentbyagentid', wrapper.asyncHandler(agentController.get_agentbyagentid));

router.post('/Apply-wallet-balance', wrapper.asyncHandler(agentController.InsertWalletApply));



// Document routes
router.post('/documents/upload', 
    documentController.getUploadMiddleware()
);

router.get('/documents/agent/:agentId', 
    wrapper.asyncHandler(async (req, res) => {
        await documentController.getAgentDocuments(req, res);
    })
);


// Approval routes // Admin routes
router.get('/pending-approvals', wrapper.asyncHandler(adminController.getApprovalsAgentlist));
router.get('/getAgentDoc-approvals', 
    wrapper.asyncHandler(adminController.getAgentDocumentsForApproval));
router.post('/update-approval', wrapper.asyncHandler(adminController.updateAgentApproval));


router.post('/get_agentlist_admin', wrapper.asyncHandler(adminController.get_agentlist_admin));


router.get('/wallet-applications', wrapper.asyncHandler(agentController.getWalletApplications));
router.post('/process-wallet-application', wrapper.asyncHandler(agentController.processWalletApplication));

router.get('/users', wrapper.asyncHandler(travelController.getUsers));


//  proposal routes
router.post('/proposal-create', wrapper.asyncHandler(proposalController.insertProposal));
router.post('/proposal-getByPassportNo', wrapper.asyncHandler(proposalController.getProposalByPassport));

router.post('/proxy-reliance-validation', wrapper.asyncHandler(proposalController.getproxyreliancevalidation));


router.post('/testuserinsert', wrapper.asyncHandler(testuserController.testuserinsert));
router.post('/gettestUserByEmail', wrapper.asyncHandler(testuserController.gettestUserByEmail));

router.post('/getProposalDetailsByAgent', wrapper.asyncHandler(BatchPaymentController.getProposalDetailsByAgent));
router.post('/insertBatchPayment', wrapper.asyncHandler(BatchPaymentController.insertBatchPayment));

router.post('/getBatchPaymentsByStatus', wrapper.asyncHandler(BatchPaymentController.getBatchPaymentsByStatus));
router.post('/updateBatchPayment', wrapper.asyncHandler(BatchPaymentController.updateBatchPayment));


router.post('/getUpdateProposalDetailsByAgent', wrapper.asyncHandler(UpdateProposalController.getUpdateProposalDetailsByAgent));

router.post('/getProposalDetailsByEmployee',wrapper.asyncHandler(UpdateProposalController.getProposalDetailsByEmployee));

router.post('/getProposalMIS',wrapper.asyncHandler(UpdateProposalController.getProposalMIS));


router.post('/getProposalTDS',wrapper.asyncHandler(UpdateProposalController.getProposalTDS));


router.post('/getPolicyDetailsbyPolicyno', wrapper.asyncHandler(UpdateProposalController.getPolicyDetailsbyPolicyno));

router.post('/updateProposal_policy', wrapper.asyncHandler(UpdateProposalController.updateProposal_policy));


// RazorPay payment routes
router.post('/Addtorazorpaydata', wrapper.asyncHandler(razorPaymentController.addToRazorpayData));
router.get('/getPaymentStatus/:policyNo', wrapper.asyncHandler(razorPaymentController.getPaymentStatus));

router.post('/generatePolicybyPolicyno', wrapper.asyncHandler(PolicyGenerateController.generatePolicybyPolicyno));



// Add route for generating sample policy
router.get('/generate-sample-policy', wrapper.asyncHandler(PolicyGenerateController.generateSamplePolicy));
router.post('/generatePolicyHTML',  wrapper.asyncHandler(PolicyGenerateController.generatePolicyHTML));


router.post('/generateInvoicePdf', wrapper.asyncHandler(InvoiceController.generateInvoiceByCertificate));

// Route to accept certificate ID from URL parameter
router.get('/generateInvoice/:certificateId', wrapper.asyncHandler(InvoiceController.generateInvoiceByCertificate));

router.post('/convert-html-to-pdf', wrapper.asyncHandler(HtmlToPdfController.convert));


router.post('/certificate-check', wrapper.asyncHandler(welcomeLetterController.checkCertificate));

// Keep existing welcome-letter route for generating PDF
router.post('/welcome-letter', wrapper.asyncHandler(welcomeLetterController.generate));

// Route to get welcome letter by customer ID  
router.get('/welcome-letter/:customerId', wrapper.asyncHandler(welcomeLetterController.getByCustomerId));

// OTP Web Verification routes
//router.post('/verify-otp', wrapper.asyncHandler(OTPVerificationController.verifyOtp));

// Check email duplicate
router.post('/check-email-duplicate', travelController.checkEmailDuplicate);

// Check mobile duplicate  
router.post('/check-mobile-duplicate', travelController.checkMobileDuplicate);


router.post('/verify-pan-pro', wrapper.asyncHandler(ZoopController.verifyPANpro));

//cancel-policy
router.post('/cancel-policy', wrapper.asyncHandler(proposalController.insertCancelPolicy));



module.exports = router;