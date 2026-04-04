// controller/BajajController.js
const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');
const axios = require('axios');
const https = require('https');
const PolicyService_bajaj = require('../services/PolicyService_bajaj');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs'); // You need fs to read/write the physical PDF files
// Configuration

const BAJAJ_CONFIG = {
    URL: "https://htsoapapi.bagicpp.bajajallianz.com/BjazTravelWebServices/SaveMasterplan",
    USERID: "webservice@policyboss.com",
    PASSWORD: "Bagic123",
    MASTER_POLICY_NO: "12-9911-0006640459-00",
    PRODUCT_CODE: "9911"
};

// HTTPS Agent — prevents socket hang-ups on Bajaj server
const httpsAgent = new https.Agent({ keepAlive: false, rejectUnauthorized: false });

// Axios Client with timeout
const bajajClient = axios.create({
    httpsAgent,
    headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
    timeout: 45000
});

// Helper: Convert dd/mm/yyyy → yyyy-mm-dd for MySQL
const formatToDbDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return null;
};

// ─────────────────────────────────────────────
// Helper: Build Bajaj Payload (shared for CALC & ISSUE)
// ─────────────────────────────────────────────
const buildBajajPayload = (serviceMode, quoteNo, body) => {
    const {
        StartDate, EndDate, JourneyFromDate, JourneyToDate, NoOfDays,
        Plan, GeographicalCover, CountryName,
        TravellerDetails, ProposerDetails
    } = body;

    return {
        pUserId: BAJAJ_CONFIG.USERID,
        pPassword: BAJAJ_CONFIG.PASSWORD,
        pServiceMode: serviceMode,
        pPayMode: "AFLOAT",
        pQuoteNo: quoteNo || "",
        familyflag: "N",
        pTravelPlanDtlsList: {
            productCode: BAJAJ_CONFIG.PRODUCT_CODE,
            Product: "GROUP TRAVEL",
            StartDate: StartDate,
            EndDate: EndDate,
            masterPolicyNumber: BAJAJ_CONFIG.MASTER_POLICY_NO,
            Plan: "TPHGLD",
            geographicalCover: GeographicalCover || "Worldwide Including USA and Canada",
            countryName: CountryName || "INDIA",
            pJourneryDtls: {
                fromDate: JourneyFromDate || StartDate,
                toDate: JourneyToDate || EndDate,
                noOfDays: String(NoOfDays)
            }
        },
        pTravellerDtls: TravellerDetails.map(t => ({
            beforeTitle: t.beforeTitle || "Mr",
            gender: t.gender || "M",
            firstName: t.firstName || "",
            middleName: t.middleName || "",
            LastName: t.LastName || "",
            dateOfBirth: t.dateOfBirth || "",
            relationWithProposer: t.relationWithProposer || "SELF",
            passportNumber: t.passportNumber || "",
            nomineeName: t.nomineeName || "",
            nomineeRelation: t.nomineeRelation || "",
            trvEmailId: "umeshchaurasia@gmail.com",
            trvMobileNumber: "9224624999",
            anyPreExistingDisease: t.anyPreExistingDisease || "No"
        })),
        pProposerDtls: {
            beforeTitle: ProposerDetails.beforeTitle || "Mr",
            firstName: ProposerDetails.firstName || "",
            middleName: ProposerDetails.middleName || "",
            LastName: ProposerDetails.LastName || "",
            dateOfBirth: ProposerDetails.dateOfBirth || "",
            GSTINNumber: ProposerDetails.GSTINNumber || "",
            PANNumber: ProposerDetails.PANNumber || "",
            Pincode: ProposerDetails.Pincode || "",
            State: ProposerDetails.State || "",
            City: ProposerDetails.City || "",
            Area: ProposerDetails.Area || "",
            Address: ProposerDetails.Address || "",
            mobileNumber: "9224624999",
            emailId: "umeshchaurasia@gmail.com",
            passportNumber: ProposerDetails.passportNumber || "",
            gender: ProposerDetails.gender || "M",
            nomineeName: ProposerDetails.nomineeName || "",
            nomineeRelation: ProposerDetails.nomineeRelation || ""
        },
        pTripDetails: {
            groupName: "No",
            natureOfGroup: "No",
            typeOfTour: "No",
            multipleCity: "No"
        }
    };
};


// Controller

class BajajController {

    constructor() {
        this.generatePolicybyPolicyno_bajaj = this.generatePolicybyPolicyno_bajaj.bind(this);

        this.checkOrGenerateASNumber_Bajaj = this.checkOrGenerateASNumber_Bajaj.bind(this);
    }


    saveMasterPlan_calc = async (req, res) => {
        try {
            const {
                AgentId,
                StartDate, EndDate, JourneyFromDate, JourneyToDate, NoOfDays,
                Plan, GeographicalCover, CountryName,
                premium, bajaj_premium_amount,
                radiobtn_selectedOption, radiobtn_selectedAmount,
                TravellerDetails, ProposerDetails, Payout_Bajaj,
                commission_agent, premium_without_gst, premium_gst

            } = req.body;

            // ── Validate required fields ──────────────────────────────────
            if (!StartDate || !EndDate || !NoOfDays) {
                return base.send_response("StartDate, EndDate and NoOfDays are required.", null, res);
            }
            if (!TravellerDetails || !Array.isArray(TravellerDetails) || TravellerDetails.length === 0) {
                return base.send_response("At least one traveller is required.", null, res);
            }
            if (!ProposerDetails) {
                return base.send_response("ProposerDetails are required.", null, res);
            }

            // ════════════════════════════════════════════════════════════
            // STEP 1: CALC_PREM — Get QuoteNo & Premium from Bajaj
            // ════════════════════════════════════════════════════════════
            const calcPayload = buildBajajPayload("CALC_PREM", "", req.body);
            logger.info(`[BAJAJ CALC REQUEST]: ${JSON.stringify(calcPayload)}`);

            let calcData;
            try {
                const calcResponse = await bajajClient.post(BAJAJ_CONFIG.URL, calcPayload);
                calcData = calcResponse.data;
                logger.info(`[BAJAJ CALC RESPONSE]: ${JSON.stringify(calcData)}`);
            } catch (calcErr) {
                // Network / timeout / server error on CALC
                logger.error(`[BAJAJ CALC NETWORK ERROR]: ${calcErr.message}`);
                const networkMsg = calcErr.response?.data?.applicationError?.errorDescription
                    || calcErr.message
                    || "Unable to reach Bajaj server for premium calculation.";
                return base.send_response(`Premium Calculation Failed: ${networkMsg}`, null, res);
            }

            // Check Bajaj application-level error from CALC
            if (!calcData || calcData?.applicationError?.errorCode !== "0") {
                const errorDesc = calcData?.applicationError?.errorDescription
                    || "Bajaj API returned an error during Premium Calculation.";
                logger.error(`[BAJAJ CALC APP ERROR]: ${errorDesc}`);
                return base.send_response(`Premium Calculation Error: ${errorDesc}`, null, res);
            }

            // ── Extract values from CALC response ────────────────────────
            const generatedQuoteNo = calcData.pQuoteNo;                         // e.g. "Q202503261234"
            const calcFinalPremium = calcData.pPremiumDtls?.finalPremium || 0;
            const calcBasePremium = calcData.pPremiumDtls?.basePrem || 0;
         //   const calcPremiumDetails = calcData.pPremiumDtls;
          //  const calcPolicyData = calcData.pPolicyData;

            logger.info(`[BAJAJ CALC SUCCESS]: QuoteNo=${generatedQuoteNo}, Premium=${calcFinalPremium}`);

            // ════════════════════════════════════════════════════════════
            // STEP 2: ISSUE_POLICY — Use QuoteNo from CALC
            // ════════════════════════════════════════════════════════════
            const issuePayload = buildBajajPayload("ISSUE_POLICY", generatedQuoteNo, req.body);
            logger.info(`[BAJAJ ISSUE REQUEST]: ${JSON.stringify(issuePayload)}`);

            let issueData;
            try {
                const issueResponse = await bajajClient.post(BAJAJ_CONFIG.URL, issuePayload);
                issueData = issueResponse.data;
                logger.info(`[BAJAJ ISSUE RESPONSE]: ${JSON.stringify(issueData)}`);
            } catch (issueErr) {
                // Network / timeout / server error on ISSUE
                logger.error(`[BAJAJ ISSUE NETWORK ERROR]: ${issueErr.message}`);
                const networkMsg = issueErr.response?.data?.applicationError?.errorDescription
                    || issueErr.message
                    || "Unable to reach Bajaj server for policy issuance.";
                return base.send_response(`Policy Issuance Failed: ${networkMsg}`, null, res);
            }

            // Check Bajaj application-level error from ISSUE
            if (!issueData || issueData?.applicationError?.errorCode !== "0") {
                const errorDesc = issueData?.applicationError?.errorDescription
                    || "Bajaj API returned an error during Policy Issuance.";
                logger.error(`[BAJAJ ISSUE APP ERROR]: ${errorDesc}`);
                return base.send_response(`Policy Issuance Error: ${errorDesc}`, null, res);
            }

            // ── Extract values from ISSUE response ────────────────────────
            const resultPolicyNo = issueData.pPolicyData?.policy_no || "PENDING";
            const resultPremium = issueData.pPremiumDtls?.finalPremium || calcFinalPremium;
            const basePrem = issueData.pPremiumDtls?.basePrem || calcBasePremium;
            const issuePremDetails = issueData.pPremiumDtls;
            const issuePolicyData = issueData.pPolicyData;
            const pdf64based = "JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjEgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iagozIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhLUJvbGQgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YyIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKNCAwIG9iago8PAovQ29udGVudHMgOCAwIFIgL01lZGlhQm94IFsgMCAwIDU5NS4yNzU2IDg0MS44ODk4IF0gL1BhcmVudCA3IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9QYWdlTW9kZSAvVXNlTm9uZSAvUGFnZXMgNyAwIFIgL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0F1dGhvciAoYW5vbnltb3VzKSAvQ3JlYXRpb25EYXRlIChEOjIwMjYwMzEyMDUxODA0KzAwJzAwJykgL0NyZWF0b3IgKGFub255bW91cykgL0tleXdvcmRzICgpIC9Nb2REYXRlIChEOjIwMjYwMzEyMDUxODA0KzAwJzAwJykgL1Byb2R1Y2VyIChSZXBvcnRMYWIgUERGIExpYnJhcnkgLSBcKG9wZW5zb3VyY2VcKSkgCiAgL1N1YmplY3QgKHVuc3BlY2lmaWVkKSAvVGl0bGUgKHVudGl0bGVkKSAvVHJhcHBlZCAvRmFsc2UKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0NvdW50IDEgL0tpZHMgWyA0IDAgUiBdIC9UeXBlIC9QYWdlcwo+PgplbmRvYmoKOCAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAxMjEKPj4Kc3RyZWFtCkdhcTNdMGFgRmImLVZtQ0BTPStiXGA5RFUucWlMPjU3Zzg6PDkhcFBKZmtIPTE5YURqM0UzTzg/ckhWKUpKYF1gYCFVVipYSlU7dUtdO3JETFlwUilfPGBdWCshQSpeT1UrWnBUIVtCZiRiYDM9KThObWtCR2Jzfj5lbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA5CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA2MSAwMDAwMCBuIAowMDAwMDAwMTAyIDAwMDAwIG4gCjAwMDAwMDAyMDkgMDAwMDAgbiAKMDAwMDAwMDMyMSAwMDAwMCBuIAowMDAwMDAwNTI0IDAwMDAwIG4gCjAwMDAwMDA1OTIgMDAwMDAgbiAKMDAwMDAwMDg1MyAwMDAwMCBuIAowMDAwMDAwOTEyIDAwMDAwIG4gCnRyYWlsZXIKPDwKL0lEIApbPDcxZmI1MDQ5ZWY3ODJmZWEzMGY3NGM5Yjc0YzIyZWU0Pjw3MWZiNTA0OWVmNzgyZmVhMzBmNzRjOWI3NGMyMmVlND5dCiUgUmVwb3J0TGFiIGdlbmVyYXRlZCBQREYgZG9jdW1lbnQgLS0gZGlnZXN0IChvcGVuc291cmNlKQoKL0luZm8gNiAwIFIKL1Jvb3QgNSAwIFIKL1NpemUgOQo+PgpzdGFydHhyZWYKMTEyMwolJUVPRgo=";

            logger.info(`[BAJAJ ISSUE SUCCESS]: PolicyNo=${resultPolicyNo}, FinalPremium=${resultPremium}`);

            // NEW STEP: Convert Base64 to PDF and save to folder

            let bajajDbUrl = "";
            try {
                // 1. Ensure the folder exists
                const bajajFolder = path.join(__dirname, '../public/policygivenbyBajaj');
                if (!fs.existsSync(bajajFolder)) {
                    fs.mkdirSync(bajajFolder, { recursive: true });
                }

                // 2. Create a clean file name using the policy number
                const cleanPolicyNo = resultPolicyNo.replace(/[^a-zA-Z0-9]/g, ''); // Removes dashes/special chars
                const bajajPdfFileName = `bajaj${cleanPolicyNo}.pdf`;
                const physicalBajajPath = path.join(bajajFolder, bajajPdfFileName);

                // 3. This is the URL we will send to the database
                bajajDbUrl = `/policygivenbyBajaj/${bajajPdfFileName}`;

                // 4. Convert base64 to buffer and save it physically
                const pdfBuffer = Buffer.from(pdf64based, 'base64');
                fs.writeFileSync(physicalBajajPath, pdfBuffer);
                logger.info(`[BAJAJ PDF SAVED]: Successfully saved to ${physicalBajajPath}`);

            } catch (fsError) {
                logger.error(`[BAJAJ PDF ERROR]: Failed to save base64 PDF: ${fsError.message}`);
            }





            // ════════════════════════════════════════════════════════════
            // STEP 3A: DB Insert — Header + Proposer (SP)
            // Total params: 42 — must match sp_SaveBajajTransaction_Header exactly
            // ════════════════════════════════════════════════════════════
            const headerParams = [
                // ── Policy Info (24 params) ──────────────────────────────
                AgentId || '0',                              // 1  p_AgentId
                "ISSUE_POLICY",                              // 2  p_ServiceMode
                generatedQuoteNo,                            // 3  p_QuoteNo
                resultPolicyNo,                              // 4  p_PolicyNo
                BAJAJ_CONFIG.PRODUCT_CODE,                   // 5  p_ProductCode
                "GROUP TRAVEL",                              // 6  p_Product
                Plan || 'TPHGLD',                            // 7  p_Plan
                BAJAJ_CONFIG.MASTER_POLICY_NO,               // 8  p_MasterPolicyNumber
                GeographicalCover || '',                     // 9  p_GeographicalCover
                CountryName || '',                           // 10 p_CountryName
                formatToDbDate(StartDate),                   // 11 p_StartDate
                formatToDbDate(EndDate),                     // 12 p_EndDate
                formatToDbDate(JourneyFromDate || StartDate),// 13 p_JourneyFromDate
                formatToDbDate(JourneyToDate || EndDate),    // 14 p_JourneyToDate
                NoOfDays || 0,                               // 15 p_NoOfDays
                basePrem || 0,                               // 16 p_BasePremium
                resultPremium || 0,                          // 17 p_FinalPremium
                BAJAJ_CONFIG.USERID,                         // 18 p_pUserId
                BAJAJ_CONFIG.PASSWORD,                       // 19 p_pPassword
                "AFLOAT",                                    // 20 p_pPayMode
                radiobtn_selectedAmount || '0',              // 21 p_Selected_PremiumAmount
                premium || '0',                              // 22 p_Actual_PremiumAmount
                bajaj_premium_amount || '0',                 // 23 p_Bajaj_PremiumAmount
                radiobtn_selectedOption || '',               // 24 p_Selected_Payment_Mode
                // ── Proposer Info (18 params) ────────────────────────────
                ProposerDetails.beforeTitle || 'Mr',         // 25 p_Prop_beforeTitle
                ProposerDetails.firstName || '',             // 26 p_Prop_firstName
                ProposerDetails.middleName || '',            // 27 p_Prop_middleName  ✅
                ProposerDetails.LastName || '',              // 28 p_Prop_LastName
                formatToDbDate(ProposerDetails.dateOfBirth), // 29 p_Prop_dateOfBirth
                ProposerDetails.emailId || '',               // 30 p_Prop_emailId
                ProposerDetails.mobileNumber || '',          // 31 p_Prop_mobileNumber
                ProposerDetails.gender || 'M',               // 32 p_Prop_gender
                ProposerDetails.Address || '',               // 33 p_Prop_Address
                ProposerDetails.City || '',                  // 34 p_Prop_City
                ProposerDetails.State || '',                 // 35 p_Prop_State
                ProposerDetails.Pincode || '',               // 36 p_Prop_Pincode
                ProposerDetails.passportNumber || '',        // 37 p_Prop_passportNumber
                ProposerDetails.GSTINNumber || '',           // 38 p_Prop_GSTINNumber  ✅
                ProposerDetails.PANNumber || '',             // 39 p_Prop_PANNumber    ✅
                ProposerDetails.Area || '',                  // 40 p_Prop_Area         ✅
                ProposerDetails.nomineeName || '',           // 41 p_Prop_nomineeName  ✅
                ProposerDetails.nomineeRelation || '',     // 42 p_Prop_nomineeRelation ✅
                Payout_Bajaj,
                bajajDbUrl,
                commission_agent || '0',
                premium_without_gst || '0',
                premium_gst || '0'
            ];

            const [headerRows] = await db.query(
                `CALL sp_SaveBajajTransaction_Header(
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?
                )`,
                headerParams
            );

            const newBajajId = headerRows[0][0].BajajId;
            if (!newBajajId) {
                logger.error(`[BAJAJ DB ERROR]: BajajId not returned from sp_SaveBajajTransaction_Header`);
                return base.send_response("Policy issued but DB save failed. Contact support.", null, res);
            }

            logger.info(`[BAJAJ DB HEADER SAVED]: BajajId=${newBajajId}`);

            // ════════════════════════════════════════════════════════════
            // STEP 3B: DB Insert — Travellers (SP) — parallel inserts
            // Total params per traveller: 15 — must match sp_SaveBajajTraveller
            // ════════════════════════════════════════════════════════════
            const travellerPromises = TravellerDetails.map((t, index) => {
                const trvParams = [
                    newBajajId,                                // 1  p_BajajId
                    AgentId || '0',                            // 2  p_AgentId
                    t.beforeTitle || 'Mr',                     // 3  p_trv_beforeTitle
                    t.gender || 'M',                           // 4  p_trv_gender
                    t.firstName || '',                         // 5  p_trv_firstName
                    t.middleName || '',                        // 6  p_trv_middleName
                    t.LastName || '',                          // 7  p_trv_LastName
                    formatToDbDate(t.dateOfBirth),             // 8  p_trv_dateOfBirth
                    t.relationWithProposer || 'SELF',          // 9  p_trv_relationWithProposer
                    t.passportNumber || '',                    // 10 p_trv_passportNumber
                    t.nomineeName || '',                       // 11 p_trv_nomineeName
                    t.nomineeRelation || '',                   // 12 p_trv_nomineeRelation
                    t.trvEmailId || '',                        // 13 p_trv_emailId
                    t.trvMobileNumber || '',                   // 14 p_trv_mobileNumber
                    t.anyPreExistingDisease || 'No'            // 15 p_trv_anyPreExistingDisease
                ];

                return db.query(
                    'CALL sp_SaveBajajTraveller(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    trvParams
                ).then(() => {
                    logger.info(`[BAJAJ DB TRAVELLER SAVED]: BajajId=${newBajajId}, Index=${index + 1}`);
                });
            });

            await Promise.all(travellerPromises);
            logger.info(`[BAJAJ DB ALL TRAVELLERS SAVED]: BajajId=${newBajajId}, Count=${TravellerDetails.length}`);

            // ════════════════════════════════════════════════════════════
            // STEP 4: Return Success Response to UI
            // ════════════════════════════════════════════════════════════
            return base.send_response("Policy Issued Successfully.", {
                // Quote & Policy
                pQuoteNo: generatedQuoteNo,
                PolicyNo: resultPolicyNo,
                dbId: newBajajId,
                AgentId: AgentId,
                // Dates
                StartDate: StartDate,
                EndDate: EndDate,
                // Premium Breakup
                pPremiumDtls: issuePremDetails,
                BasePremium: basePrem,
                FinalPremium: resultPremium,
                // Policy Data
                pPolicyData: issuePolicyData,
                // Bajaj Error Block (errorCode "0" = success)
                applicationError: issueData.applicationError
            }, res);

        } catch (error) {
            // Catch-all: unexpected errors (DB crash, code bug, etc.)
            logger.error(`[BAJAJ CONTROLLER ERROR]: ${error.message} | Stack: ${error.stack}`);
            const apiMsg = error.response?.data?.applicationError?.errorDescription
                || error.message
                || "An unexpected error occurred. Please try again.";
            return base.send_response(`Error: ${apiMsg}`, null, res);
        }
    }


    async getPremium_including_bajaj(req, res) {
        try {
            const { duration, age_years, age_months, plan_amount, agentid } = req.body;

            // Call stored procedure
            const [rows] = await db.query(
                'CALL GetPremium_including_bajaj(?,?,?,?,?)',
                [duration, age_years, age_months, plan_amount, agentid]
            );

            // Get first row of result
            const result = rows[0][0];

            if (result.SuccessStatus === '1') {
                // Successful login
                base.send_response(
                    "Premium including successful",
                    {
                        premium_amount: result.premium_amount,
                        agentcollected: result.agentcollected,
                        paymentmode: result.paymentmode,
                        payout_bajaj: result.v_Payout,
                        reliance_premium_amount: result.reliance_premium_amount,
                        upfront_agent_commission: result.upfront_agent_commission,
                        commission_agent: result.commission_agent,
                        premium_without_gst: result.premium_without_gst,
                        premium_gst: result.premium_gst
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

    // Premium_excluding

    async getPremium_excluding_bajaj(req, res) {
        try {
            const { duration, age_years, age_months, plan_amount, agentid } = req.body;

            // Call stored procedure
            const [rows] = await db.query(
                'CALL GetPremium_excluding_bajaj(?,?,?,?,?)',
                [duration, age_years, age_months, plan_amount, agentid]
            );

            // Get first row of result
            const result = rows[0][0];

            if (result.SuccessStatus === '1') {
                // Successful login
                base.send_response(
                    "Premium excluding successful",
                    {
                        premium_amount: result.premium_amount,
                        agentcollected: result.agentcollected,
                        paymentmode: result.paymentmode,
                        payout_bajaj: result.v_Payout,
                        reliance_premium_amount: result.reliance_premium_amount,
                        upfront_agent_commission: result.upfront_agent_commission,
                        commission_agent: result.commission_agent,
                        premium_without_gst: result.premium_without_gst,
                        premium_gst: result.premium_gst
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

    // Method to check or generate AS number
    async checkOrGenerateASNumber_Bajaj(policyNumber, policyStartDate, policyEndDate, fullName, fullAddress, premiumAmount, emailID, mobileNumber, day_of_difference) {
        try {
            logger.info(`Checking or generating AS number for policy: ${policyNumber}`);

            // First check if AS number already exists
            const [existingRows] = await db.query('SELECT * FROM welcome_letter_bajaj WHERE Policy_Number = ?', [policyNumber]);

            if (existingRows && existingRows.length > 0) {
                // Use existing record
                const asNumber = existingRows[0].Asnumber_bajaj;
                logger.info(`Found existing AS number: ${asNumber}`);
                return asNumber;
            } else {
                // Create new record with new AS number
                logger.info('No existing AS number found, creating new one');

                // Get next AS number
                const [numResults] = await db.query(
                    'SELECT IFNULL(MAX(CAST(SUBSTRING(Asnumber_bajaj, 4) AS SIGNED)), 0) + 1 AS nextNum FROM welcome_letter_bajaj'
                );

                const nextNum = numResults[0].nextNum || 1;
                const asNumber = 'ASB' + String(nextNum).padStart(8, '0');

                // Format dates properly if they're Date objects
                const formattedStartDate = policyStartDate instanceof Date ?
                    policyStartDate.toISOString().split('T')[0] : policyStartDate;

                const formattedEndDate = policyEndDate instanceof Date ?
                    policyEndDate.toISOString().split('T')[0] : policyEndDate;

                // Insert new record with all the provided fields
                const [insertResult] = await db.query(
                    `INSERT INTO welcome_letter_bajaj 
                (Policy_Number, Asnumber_bajaj, PolicyStartDate, PolicyEndDate, 
                fulladdress, fullname, PremiumAmount, cust_EmailID, cust_MobileNumber, travelDuration, Created_Date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [policyNumber, asNumber, formattedStartDate, formattedEndDate,
                        fullAddress, fullName, premiumAmount, emailID, mobileNumber, day_of_difference]
                );

                logger.info(`Created new AS number: ${asNumber}`);
                return asNumber;
            }
        } catch (error) {
            logger.error(`Error checking/generating AS number: ${error.message}`);
            throw error;
        }
    }

    //PDF GENERATOR
    // Updated part of PolicyGenerateController.js

    async generatePolicybyPolicyno_bajaj(req, res) {
        try {
            logger.info('API call received for generatePolicybyPolicyno_bajaj');
            const { Policyno } = req.body;
            logger.info(`Policy number: ${Policyno}`);

            if (!Policyno) {
                logger.warn('Missing policy number in request');
                return base.send_response("Policy No is required", null, res, 400);
            }

            // Get policy details
            const [policyRows] = await db.query('CALL getPolicyDetailsbyPolicyno_bajaj(?)', [Policyno]);
            const results = policyRows[0];

            logger.info(`Query results count: ${results ? results.length : 0}`);

            if (results && results.length > 0) {
                const policyData = results[0];
                logger.info(`Found policy data for ${Policyno}, generating documents`);
                const rawPlanAmount = policyData.PremiumAmount;

                try {
                    const fullName = [policyData.Title, policyData.FirstName, policyData.MiddleName, policyData.LastName].filter(Boolean).join(' ');
                    const fullAddress = [policyData.AddressLine1, policyData.AddressLine2, policyData.CityName, policyData.State, policyData.PinCode].filter(Boolean).join(', ');

                    const asNumber = await this.checkOrGenerateASNumber_Bajaj(
                        Policyno,
                        policyData.PolicyStartDate,
                        policyData.PolicyEndDate,
                        fullName,
                        fullAddress,
                        policyData.PremiumAmount,
                        policyData.EmailID,
                        policyData.MobileNumber,
                        policyData.day_of_difference
                    );
                    policyData.Asnumber = asNumber;
                    logger.info(`Using AS Number: ${asNumber} for policy ${Policyno}`);
                } catch (asError) {
                    logger.error(`Error getting AS number: ${asError.message}`);
                    policyData.Asnumber = ''; // Set to empty string if error occurs
                }

                // Store the original plan amount separately
                policyData.originalPlanAmount = rawPlanAmount;

                // Ensure directories exist
                const publicDir = path.join(__dirname, '../public');
                const welcomeLetterDir = path.join(publicDir, 'welcome-letters-bajaj');
                const combinedPdfDir = path.join(publicDir, 'policybajaj');

                // Generate PDF and related assets
                PolicyService_bajaj.generatePolicy_bajaj(Policyno, policyData, async (err, result) => {
                    if (err) {
                        logger.error('Policy generation error:', err);
                        return base.send_response("Error generating policy documents: " + err.message, { count: results.length, proposals: results }, res, 500);
                    }

                    const certificateId = Policyno;

                    // ====================================================================
                    // FIX: Format File Name and Move to correct folder (welcome-letters-bajaj)
                    // ====================================================================
                    const originalPdfPath = path.resolve(result.pdfPath); // e.g. /public/policybajaj/12-9911-000...pdf
                    const rawFileName = path.basename(result.pdfPath);

                    // Force the required prefix "Welcome-letters-" if it doesn't have it
                    const pdfFileName = rawFileName.startsWith('Welcome-letters-')
                        ? rawFileName
                        : `Welcome-letters-${rawFileName}`;

                    const newWelcomeLetterPath = path.join(welcomeLetterDir, pdfFileName);

                    // Ensure target directory exists
                    if (!fs.existsSync(welcomeLetterDir)) {
                        fs.mkdirSync(welcomeLetterDir, { recursive: true });
                    }

                    // Move/Rename physical file to the required folder and name
                    if (fs.existsSync(originalPdfPath) && originalPdfPath !== newWelcomeLetterPath) {
                        fs.renameSync(originalPdfPath, newWelcomeLetterPath);
                        logger.info(`Moved welcome letter to ${newWelcomeLetterPath}`);
                    }

                    // 1. Correct Database URL for PolicypdfUrl
                    const pdfUrl = `/welcome-letters-bajaj/${pdfFileName}`;

                    // Create a unique name for the combined PDF so it doesn't overwrite the original
                    const combinedPdfFileName = `Combined_${rawFileName}`;
                    const combinepdfurl = `/policybajaj/${combinedPdfFileName}`;

                    // Safe fallback for null database values
                    const bajajDbUrl = policyData.BajajgivenpolicyUrl || '';
                    let finalMergedUrl = null;

                    // 2. Safely Attempt PDF Merge
                    try {
                        if (bajajDbUrl) {
                            // Read from the NEW welcome letter path
                            const welcomeLetterPath = newWelcomeLetterPath;

                            let normalizedBajajUrl = bajajDbUrl.replace(/^\/?(public\/)?/, '');
                            const bajajPolicyPath = path.join(publicDir, normalizedBajajUrl);
                            const finalCombinedPath = path.join(combinedPdfDir, combinedPdfFileName);

                            // Check if BOTH files exist before merging
                            if (fs.existsSync(welcomeLetterPath) && fs.existsSync(bajajPolicyPath)) {
                                const welcomePdfBytes = await fs.promises.readFile(welcomeLetterPath);
                                const bajajPdfBytes = await fs.promises.readFile(bajajPolicyPath);

                                const mergedPdf = await PDFDocument.create();
                                const welcomePdfDoc = await PDFDocument.load(welcomePdfBytes);
                                const bajajPdfDoc = await PDFDocument.load(bajajPdfBytes);

                                const welcomePages = await mergedPdf.copyPages(welcomePdfDoc, welcomePdfDoc.getPageIndices());
                                welcomePages.forEach((page) => mergedPdf.addPage(page));

                                const bajajPages = await mergedPdf.copyPages(bajajPdfDoc, bajajPdfDoc.getPageIndices());
                                bajajPages.forEach((page) => mergedPdf.addPage(page));

                                const mergedPdfBytesSaved = await mergedPdf.save();

                                if (!fs.existsSync(combinedPdfDir)) {
                                    fs.mkdirSync(combinedPdfDir, { recursive: true });
                                }
                                await fs.promises.writeFile(finalCombinedPath, mergedPdfBytesSaved);

                                logger.info(`Successfully combined PDFs into: ${finalCombinedPath}`);
                                finalMergedUrl = combinepdfurl; // Set successfully merged URL
                            } else {
                                logger.warn('Original Bajaj Policy or Welcome Letter not found on disk. Skipping merge.');
                            }
                        } else {
                            logger.warn('No BajajgivenpolicyUrl found in DB. Skipping merge.');
                        }
                    } catch (mergeError) {
                        logger.error(`Error merging PDFs: ${mergeError.message}`);
                    }

                    // 3. ALWAYS Update the Database
                    try {
                        // IF finalMergedUrl is null (merge failed), it keeps the old Main_Bajaj_Policy_Url using IFNULL
                        const updateQuery = `UPDATE Bajaj_Travel_Proposal_main SET PolicypdfUrl = ?, Main_Bajaj_Policy_Url = IFNULL(?, Main_Bajaj_Policy_Url) WHERE PolicyNo = ?`;
                        const [updateResult] = await db.query(updateQuery, [pdfUrl, finalMergedUrl, certificateId]);

                        if (updateResult.affectedRows > 0) {
                            logger.info(`Successfully updated proposal_main for certificate: ${certificateId}`);
                        } else {
                            logger.warn(`No rows updated in proposal_main for certificate: ${certificateId}`);
                        }
                    } catch (dbError) {
                        logger.error(`Error updating Database: ${dbError.message}`);
                    }

                    // 4. Final response
                    logger.info(`Successfully generated documents for policy ${Policyno}`);
                    base.send_response(
                        "Policy documents generated successfully",
                        {
                            count: results.length,
                            proposals: results,
                            combinepdfurl: finalMergedUrl,
                            qrCodeUrl: (result.qrCodePath || '').replace('./public', ''),
                            asNumber: result.processedData?.Asnumber || policyData.Asnumber
                        },
                        res
                    );
                });
            } else {
                logger.warn(`No policy found for ${Policyno}`);
                base.send_response("No Policy found for the given criteria", { count: 0, proposals: [] }, res);
            }
        } catch (error) {
            logger.error('generatePolicybyPolicyno error:', error);
            base.send_response("Error retrieving policy details: " + (error.message || error), null, res, 500);
        }
    }

    async getProposalByPassport_bajaj(req, res) {
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
                'CALL sp_GetProposalBypassport_bajaj(?)',
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

    async getUpdateProposalDetailsByAgent_bajaj(req, res) {
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
                'CALL getUpdateProposalDetailsByAgent_bajaj(?, ?)',
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

    async InsertWalletApply_bajaj(req, res) {
        try {
            const {
                AgentId,
                Agent_Code,
                wallet_amount
            } = req.body;
            const [result] = await db.query(
                'CALL InsertWalletApply(?, ?, ?)',
                [AgentId,
                    Agent_Code,
                    wallet_amount
                ]
            );
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

    async getSub_Main_AgentMIS_byAdmin_bajaj(req, res) {
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
                'CALL getSub_Main_AgentMIS_byAdmin_bajaj(?, ?, ?, ?)',
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

    async getProposalDetailsByEmployee_bajaj(req, res) {
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
                'CALL getProposalDetailsByEmployee_bajaj(?,?,?)',
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


    async getPolicyDetailsbyPolicyno_bajaj(req, res) {
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
                'CALL getPolicyDetailsbyPolicyno_bajaj(?)',
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

    async insertCancelPolicy_bajaj(req, res) {
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
                'CALL insert_cancel_policy_bajaj(?, ?, ?, ?, ?, ?)',
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

    async getProposalMIS_bajaj(req, res) {
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
                'CALL getProposal_MIS_bajaj(?, ?, ?, ?)',
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
    async getProposalTDSbajaj(req, res) {
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
                'CALL getProposal_TDS_bajaj(?, ?, ?, ?)',
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

    async getProposalMIS_SubAgent_bajaj(req, res) {
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
                'CALL getSubAgent_byAgent_MIS_bajaj(?, ?, ?, ?)',
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

    async getProposalTDS_SubAgent_bajaj(req, res) {
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
                'CALL getProposal_TDS_byAgent_MIS_bajaj(?, ?, ?, ?)',
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



module.exports = new BajajController();