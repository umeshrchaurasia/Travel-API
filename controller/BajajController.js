// controller/BajajController.js
const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');
const axios = require('axios');
const https = require('https');
const PolicyService_bajaj = require('../services/PolicyService_bajaj');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

// const BAJAJ_CONFIG_QA = {
//     URL: "https://htapi.preprod.bajajgeneral.com/BjazTravelWebServices/SaveMasterplan",
//     USERID: "webservice@policyboss.com",
//     PASSWORD: "Bagic123",
//     MASTER_POLICY_NO: "12-9911-0006640459-00",
//     PRODUCT_CODE: "9911" //56530082
// };

const BAJAJ_CONFIG = {
    URL: "https://pit.bajajgeneral.com/BjazTravelWebServices/SaveMasterplan",
    USERID: "webservice@policyboss.com",
    PASSWORD: "password",
    MASTER_POLICY_NO: "12-9911-0009069439-00",
    PRODUCT_CODE: "9911"
};

const httpsAgent = new https.Agent({ keepAlive: false, rejectUnauthorized: false });

const bajajClient = axios.create({
    httpsAgent,
    headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
    timeout: 45000
});

const formatToDbDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return null;
};

const buildBajajPayload = (serviceMode, quoteNo, body) => {
    const {
        StartDate, EndDate, JourneyFromDate, JourneyToDate, NoOfDays,
        Plan, GeographicalCover, CountryName,
        TravellerDetails, ProposerDetails
    } = body;

    const cleanPlan = (Plan && typeof Plan === 'string') ? Plan.trim() : "";

    // --- NEW LOGIC: Check if Proposer firstName differs from Traveler firstName ---
    let calculatedFamilyFlag = "N";
    if (TravellerDetails && TravellerDetails.length > 0 && ProposerDetails) {
        const proposerName = (ProposerDetails.firstName || "").trim().toLowerCase();

        // Check if ANY traveler has a different first name than the proposer
        const isDifferent = TravellerDetails.some(t =>
            (t.firstName || "").trim().toLowerCase() !== proposerName
        );

        if (isDifferent) {
            calculatedFamilyFlag = "Y";
        }
    }
    // ------------------------------------------------------------------------------

    return {
        pUserId: BAJAJ_CONFIG.USERID,
        pPassword: BAJAJ_CONFIG.PASSWORD,
        pServiceMode: serviceMode,
        pPayMode: "AFLOAT",
        pQuoteNo: quoteNo || "",

        // --- UPDATED FLAG ---
        familyflag: calculatedFamilyFlag,

        pTravelPlanDtlsList: {
            productCode: BAJAJ_CONFIG.PRODUCT_CODE,
            Product: "GROUP TRAVEL",
            StartDate: StartDate,
            EndDate: EndDate,
            masterPolicyNumber: BAJAJ_CONFIG.MASTER_POLICY_NO,
            Plan: cleanPlan || "",
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
            trvEmailId: t.trvEmailId,
            trvMobileNumber: t.trvMobileNumber,
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
            mobileNumber: ProposerDetails.mobileNumber,
            emailId: ProposerDetails.emailId,
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

const logBajajApiActivity = async (endpoint, requestData, successData, failData) => {
    try {
        const query = `INSERT INTO bajaj_api_logs (endpoint, request_data, success_data, fail_data, created_at) VALUES (?, ?, ?, ?, NOW())`;
        await db.query(query, [
            endpoint,
            requestData ? JSON.stringify(requestData) : null,
            successData ? JSON.stringify(successData) : null,
            failData ? String(failData) : null
        ]);

        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const logDirectory = path.join(__dirname, '../public/bajaj_api_logs');

        if (!fs.existsSync(logDirectory)) {
            fs.mkdirSync(logDirectory, { recursive: true });
        }

        const logFilePath = path.join(logDirectory, `${dateStr}.txt`);
        const logContent = `
=========================================================
Time: ${today.toISOString()}
Endpoint: ${endpoint}
Request Data: ${requestData ? JSON.stringify(requestData, null, 2) : 'N/A'}
Success Data: ${successData ? JSON.stringify(successData, null, 2) : 'N/A'}
Fail Data: ${failData ? String(failData) : 'N/A'}
=========================================================\n`;

        fs.appendFileSync(logFilePath, logContent);
    } catch (err) {
        logger.error(`[BAJAJ LOGGING ERROR]: Failed to log API activity: ${err.message}`);
    }
};

class BajajController {
    constructor() {
        this.generatePolicybyPolicyno_bajaj = this.generatePolicybyPolicyno_bajaj.bind(this);
        this.checkOrGenerateASNumber_Bajaj = this.checkOrGenerateASNumber_Bajaj.bind(this);
        this.bajajlivepdf = this.bajajlivepdf.bind(this);

        this.Excel_InsertBajajTravelProposal = this.Excel_InsertBajajTravelProposal.bind(this);
        this.uploadBajajManualPdf = this.uploadBajajManualPdf.bind(this);
    }

    saveMasterPlan_calc = async (req, res) => {
        try {
            const {
                AgentId, StartDate, EndDate, JourneyFromDate, JourneyToDate, NoOfDays,
                Plan, GeographicalCover, CountryName, premium, bajaj_premium_amount,
                radiobtn_selectedOption, radiobtn_selectedAmount, TravellerDetails,
                ProposerDetails, Payout_Bajaj, commission_agent, premium_without_gst,
                premium_gst, Ss_id
            } = req.body;

            if (!StartDate || !EndDate || !NoOfDays) return base.send_response("StartDate, EndDate and NoOfDays are required.", null, res);
            if (!TravellerDetails || !Array.isArray(TravellerDetails) || TravellerDetails.length === 0) return base.send_response("At least one traveller is required.", null, res);
            if (!ProposerDetails) return base.send_response("ProposerDetails are required.", null, res);

            // ════════════════════════════════════════════════════════════
            // STEP 1: CALC_PREM 
            // ════════════════════════════════════════════════════════════
            const calcPayload = buildBajajPayload("CALC_PREM", "", req.body);
            logger.info(`[BAJAJ CALC REQUEST]: ${JSON.stringify(calcPayload)}`);

            let calcData;
            try {
                const calcResponse = await bajajClient.post(BAJAJ_CONFIG.URL, calcPayload);
                calcData = calcResponse.data;
                await logBajajApiActivity("CALC_PREM", calcPayload, calcData, null);
            } catch (calcErr) {
                await logBajajApiActivity("CALC_PREM", calcPayload, null, calcErr.message);
                return base.send_response(`Premium Calculation Failed: ${calcErr.message}`, null, res);
            }

            if (!calcData || calcData?.applicationError?.errorCode !== "0") {
                return base.send_response(`Premium Calculation Error`, null, res);
            }

            const generatedQuoteNo = calcData.pQuoteNo;
            const calcFinalPremium = calcData.pPremiumDtls?.finalPremium || 0;
            const calcBasePremium = calcData.pPremiumDtls?.basePrem || 0;

            // ════════════════════════════════════════════════════════════
            // STEP 2: ISSUE_POLICY
            // ════════════════════════════════════════════════════════════
            const issuePayload = buildBajajPayload("ISSUE_POLICY", generatedQuoteNo, req.body);
            let issueData;
            try {
                const issueResponse = await bajajClient.post(BAJAJ_CONFIG.URL, issuePayload);
                issueData = issueResponse.data;
                await logBajajApiActivity("ISSUE_POLICY", issuePayload, issueData, null);
            } catch (issueErr) {
                await logBajajApiActivity("ISSUE_POLICY", issuePayload, null, issueErr.message);
                return base.send_response(`Policy Issuance Failed: ${issueErr.message}`, null, res);
            }

            if (!issueData || issueData?.applicationError?.errorCode !== "0") {
                return base.send_response(`Policy Issuance Error`, null, res);
            }

            const resultPolicyNo = issueData.pPolicyData?.policy_no || "PENDING";
            const resultPremium = issueData.pPremiumDtls?.finalPremium || calcFinalPremium;
            const basePrem = issueData.pPremiumDtls?.basePrem || calcBasePremium;
            const issuePremDetails = issueData.pPremiumDtls;
            const issuePolicyData = issueData.pPolicyData;

            // ════════════════════════════════════════════════════════════
            // STEP 2B: Fetch Token & Download PDF from Bajaj API
            // (mirrors bajajlivepdf exactly — full base64 parsing logic)
            // ════════════════════════════════════════════════════════════
            let bajajDbUrl = "";

            if (resultPolicyNo !== "PENDING") {
                try {
                    // ── Token ──────────────────────────────────────────────
                    const tokenPayload = new URLSearchParams({
                        grant_type: 'password',
                        client_id: 'B2BService_Client',
                        client_secret: '0299dec1-fb95-45a8-8770-ca9537fc252c',
                        username: 'webservice@policyboss.com',
                        password: 'password',
                    }).toString();

                    logger.info(`[BAJAJ PDF] Fetching OAuth token for policy: ${resultPolicyNo}`);

                    const tokenResponse = await axios.post(
                        'https://auth.prod.bajajgeneral.com/auth/realms/Bagic/protocol/openid-connect/token',
                        tokenPayload,
                        {
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            httpsAgent
                        }
                    );

                    const accessToken = tokenResponse.data.access_token;
                    if (!accessToken) {
                        throw new Error("No access token returned from Bajaj auth API");
                    }

                    logger.info(`[BAJAJ PDF] Token received: ${accessToken.substring(0, 20)}...[OK]`);
                    await logBajajApiActivity("BAJAJ_OAUTH_TOKEN",
                        { grant_type: 'password', client_id: 'B2BService_Client', username: 'webservice@policyboss.com', password: '***' },
                        { success: true }, null
                    );

                    // ── PDF Download ───────────────────────────────────────
                    const pdfDownloadUrl = `https://pit.bajajallianz.com/bjazDownload/travel/downloadPdf/${resultPolicyNo}`;
                    logger.info(`[BAJAJ PDF] Calling PDF URL: ${pdfDownloadUrl}`);

                    const pdfResponse = await axios.get(pdfDownloadUrl, {
                        headers: {
                            'auth': `Bearer ${accessToken}`,          // Bajaj custom header
                            'Authorization': `Bearer ${accessToken}`, // keep both just in case
                        },
                        responseType: 'text',  // Bajaj returns raw base64 string, not binary
                        httpsAgent
                    });

                    // ── Parse Response ─────────────────────────────────────
                    // Bajaj can return:
                    //   a) Plain base64 string
                    //   b) JSON: { "downloadedPdf": "base64..." }
                    //   c) JSON: { "file": "base64..." }
                    //   d) JSON: { "p_pdf_string": "base64..." }
                    //   e) Quoted string: "\"base64...\""
                    let rawData = pdfResponse.data;

                    logger.info(`[BAJAJ PDF] Response type: ${typeof rawData}, length: ${rawData?.length}`);
                    await logBajajApiActivity("BAJAJ_PDF_RAW_RESPONSE", { url: pdfDownloadUrl }, {
                        dataType: typeof rawData,
                        length: rawData?.length,
                        rawSnippet: typeof rawData === 'string' ? rawData.substring(0, 200) : JSON.stringify(rawData).substring(0, 200)
                    }, null);

                    let pdfBase64 = rawData;

                    // Try parsing as JSON string first
                    if (typeof pdfBase64 === 'string') {
                        const trimmed = pdfBase64.trim();
                        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                            try {
                                const parsed = JSON.parse(trimmed);
                                pdfBase64 = parsed.downloadedPdf
                                    || parsed.file
                                    || parsed.p_pdf_string
                                    || parsed.data
                                    || parsed.pdf
                                    || parsed.base64
                                    || null;
                                if (!pdfBase64) {
                                    throw new Error(`JSON response received but no known key found. Keys: ${Object.keys(parsed).join(', ')}`);
                                }
                            } catch (parseErr) {
                                throw new Error(`Failed to parse JSON response: ${parseErr.message}`);
                            }
                        }
                    }

                    // Handle object response (axios auto-parsed JSON despite responseType:'text')
                    if (typeof pdfBase64 === 'object' && pdfBase64 !== null) {
                        pdfBase64 = pdfBase64.downloadedPdf
                            || pdfBase64.file
                            || pdfBase64.p_pdf_string
                            || pdfBase64.data
                            || pdfBase64.pdf
                            || null;
                    }

                    // Strip surrounding quotes  "base64string" → base64string
                    if (typeof pdfBase64 === 'string') {
                        pdfBase64 = pdfBase64.trim().replace(/^"|"$/g, '');
                    }

                    if (!pdfBase64 || pdfBase64.length < 100) {
                        throw new Error(`Invalid or empty base64 received. Length: ${pdfBase64?.length}. Raw: ${String(rawData).substring(0, 300)}`);
                    }

                    // ── Convert base64 → Buffer → Validate → Save ──────────
                    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

                    const pdfHeader = pdfBuffer.slice(0, 4).toString('ascii');
                    if (pdfHeader !== '%PDF') {
                        throw new Error(`Decoded data is not a valid PDF. Header bytes: "${pdfHeader}". Base64 length was: ${pdfBase64.length}`);
                    }

                    const bajajFolder = path.join(__dirname, '../public/policygivenbyBajaj');
                    if (!fs.existsSync(bajajFolder)) {
                        fs.mkdirSync(bajajFolder, { recursive: true });
                    }

                    const cleanPolicyNo = resultPolicyNo.replace(/[^a-zA-Z0-9]/g, '');
                    const bajajPdfFileName = `bajaj${cleanPolicyNo}.pdf`;
                    const physicalBajajPath = path.join(bajajFolder, bajajPdfFileName);
                    bajajDbUrl = `/policygivenbyBajaj/${bajajPdfFileName}`;

                    fs.writeFileSync(physicalBajajPath, pdfBuffer);
                    logger.info(`[BAJAJ PDF] Saved: ${physicalBajajPath} (${pdfBuffer.length} bytes)`);

                    await logBajajApiActivity("BAJAJ_PDF_DOWNLOAD_SUCCESS",
                        { policyNo: resultPolicyNo },
                        { savedPath: physicalBajajPath, dbUrl: bajajDbUrl, sizeBytes: pdfBuffer.length },
                        null
                    );

                } catch (pdfErr) {
                    let errMsg = pdfErr.message;
                    if (pdfErr.response?.data) {
                        const errData = Buffer.isBuffer(pdfErr.response.data)
                            ? pdfErr.response.data.toString()
                            : JSON.stringify(pdfErr.response.data);
                        errMsg += ` | HTTP ${pdfErr.response.status} | Details: ${errData.substring(0, 500)}`;
                    }
                    logger.error(`[BAJAJ PDF ERROR]: ${errMsg}`);
                    await logBajajApiActivity("BAJAJ_PDF_DOWNLOAD_ERROR", { policyNo: resultPolicyNo }, null, errMsg);
                    // Non-fatal: policy was issued successfully; PDF failure is logged but does not block the response
                }
            }

            // ════════════════════════════════════════════════════════════
            // STEP 3A: DB Insert — Header + Proposer (SP)
            // ════════════════════════════════════════════════════════════
            const headerParams = [
                AgentId || '0', "ISSUE_POLICY", generatedQuoteNo, resultPolicyNo, BAJAJ_CONFIG.PRODUCT_CODE,
                "GROUP TRAVEL", Plan || '', BAJAJ_CONFIG.MASTER_POLICY_NO, GeographicalCover || '',
                CountryName || '', formatToDbDate(StartDate), formatToDbDate(EndDate), formatToDbDate(JourneyFromDate || StartDate),
                formatToDbDate(JourneyToDate || EndDate), NoOfDays || 0, basePrem || 0, resultPremium || 0,
                BAJAJ_CONFIG.USERID, BAJAJ_CONFIG.PASSWORD, "AFLOAT", radiobtn_selectedAmount || '0',
                premium || '0', bajaj_premium_amount || '0', radiobtn_selectedOption || '', ProposerDetails.beforeTitle || 'Mr',
                ProposerDetails.firstName || '', ProposerDetails.middleName || '', ProposerDetails.LastName || '',
                formatToDbDate(ProposerDetails.dateOfBirth), ProposerDetails.emailId || '', ProposerDetails.mobileNumber || '',
                ProposerDetails.gender || 'M', ProposerDetails.Address || '', ProposerDetails.City || '',
                ProposerDetails.State || '', ProposerDetails.Pincode || '', ProposerDetails.passportNumber || '',
                ProposerDetails.GSTINNumber || '', ProposerDetails.PANNumber || '', ProposerDetails.Area || '',
                ProposerDetails.nomineeName || '', ProposerDetails.nomineeRelation || '', Payout_Bajaj, bajajDbUrl,
                commission_agent || '0', premium_without_gst || '0', premium_gst || '0', Ss_id || ''
            ];

            const [headerRows] = await db.query(
                `CALL sp_SaveBajajTransaction_Header(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                headerParams
            );

            const newBajajId = headerRows[0][0].BajajId;

            // ════════════════════════════════════════════════════════════
            // STEP 3B: DB Insert — Travellers (SP)
            // ════════════════════════════════════════════════════════════
            const travellerPromises = TravellerDetails.map((t, index) => {
                const trvParams = [
                    newBajajId, AgentId || '0', t.beforeTitle || 'Mr', t.gender || 'M', t.firstName || '',
                    t.middleName || '', t.LastName || '', formatToDbDate(t.dateOfBirth), t.relationWithProposer || 'SELF',
                    t.passportNumber || '', t.nomineeName || '', t.nomineeRelation || '', t.trvEmailId || '',
                    t.trvMobileNumber || '', t.anyPreExistingDisease || 'No'
                ];
                return db.query('CALL sp_SaveBajajTraveller(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', trvParams);
            });

            await Promise.all(travellerPromises);

            return base.send_response("Policy Issued Successfully.", {
                pQuoteNo: generatedQuoteNo,
                PolicyNo: resultPolicyNo,
                dbId: newBajajId,
                AgentId: AgentId,
                StartDate: StartDate,
                EndDate: EndDate,
                pPremiumDtls: issuePremDetails,
                BasePremium: basePrem,
                FinalPremium: resultPremium,
                pPolicyData: issuePolicyData,
                applicationError: issueData.applicationError
            }, res);

        } catch (error) {
            return base.send_response(`Error: ${error.message}`, null, res);
        }
    }

    // [All other exact methods remain completely unchanged...]
    async getPremium_including_bajaj(req, res) {
        try {
            const { duration, age_years, age_months, plan_amount, agentid } = req.body;
            const [rows] = await db.query(
                'CALL GetPremium_including_bajaj(?,?,?,?,?)',
                [duration, age_years, age_months, plan_amount, agentid]
            );

            const result = rows[0][0];

            if (result.SuccessStatus === '1') {
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
                base.send_response(
                    result.Message || "Invalid credentials",
                    null,
                    res,
                    401
                );
            }
        } catch (error) {
            logger.error('Login error:', error);
            base.send_response("Error during login process", null, res, 500);
        }
    }

    async getPremium_excluding_bajaj(req, res) {
        try {
            const { duration, age_years, age_months, plan_amount, agentid } = req.body;
            const [rows] = await db.query(
                'CALL GetPremium_excluding_bajaj(?,?,?,?,?)',
                [duration, age_years, age_months, plan_amount, agentid]
            );

            const result = rows[0][0];

            if (result.SuccessStatus === '1') {
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
                base.send_response(
                    result.Message || "Invalid credentials",
                    null,
                    res,
                    401
                );
            }
        } catch (error) {
            logger.error('Login error:', error);
            base.send_response("Error during login process", null, res, 500);
        }
    }

    async checkOrGenerateASNumber_Bajaj(policyNumber, policyStartDate, policyEndDate, fullName, fullAddress, premiumAmount, emailID, mobileNumber, day_of_difference) {
        try {
            logger.info(`Checking or generating AS number for policy: ${policyNumber}`);
            const [existingRows] = await db.query('SELECT * FROM welcome_letter_bajaj WHERE Policy_Number = ?', [policyNumber]);

            if (existingRows && existingRows.length > 0) {
                const asNumber = existingRows[0].Asnumber_bajaj;
                logger.info(`Found existing AS number: ${asNumber}`);
                return asNumber;
            } else {
                logger.info('No existing AS number found, creating new one');
                const [numResults] = await db.query(
                    "SELECT IFNULL(MAX(CAST(SUBSTRING(Asnumber_bajaj, 4) AS SIGNED)), 0) + 1 AS nextNum FROM welcome_letter_bajaj WHERE Asnumber_bajaj LIKE 'BEU%'"
                );

                let nextNum = numResults[0].nextNum || 1;
                if (nextNum === 1) {
                    nextNum = 10001;
                }
                const asNumber = 'BEU' + String(nextNum).padStart(8, '0');

                const formattedStartDate = policyStartDate instanceof Date ?
                    policyStartDate.toISOString().split('T')[0] : policyStartDate;

                const formattedEndDate = policyEndDate instanceof Date ?
                    policyEndDate.toISOString().split('T')[0] : policyEndDate;

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

    async generatePolicybyPolicyno_bajaj(req, res) {
        try {
            logger.info('API call received for generatePolicybyPolicyno_bajaj');
            const { Policyno } = req.body;
            logger.info(`Policy number: ${Policyno}`);

            if (!Policyno) {
                logger.warn('Missing policy number in request');
                return base.send_response("Policy No is required", null, res, 400);
            }

            const [policyRows] = await db.query('CALL getPolicyDetailsbyPolicyno_bajaj1(?)', [Policyno]);
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
                    policyData.Asnumber = '';
                }

                policyData.originalPlanAmount = rawPlanAmount;

                const publicDir = path.join(__dirname, '../public');
                const welcomeLetterDir = path.join(publicDir, 'welcome-letters-bajaj');
                const combinedPdfDir = path.join(publicDir, 'finalcombine_bajajpolicy');

                const rawFileName = `BajajPolicy_${Policyno}.pdf`;
                const originalPdfPath = path.join(publicDir, 'policybajaj', rawFileName);

                const combinedPdfFileName = `Combined_${rawFileName}`;
                const combinepdfurl = `/finalcombine_bajajpolicy/${combinedPdfFileName}`;
                const finalCombinedPath = path.join(combinedPdfDir, combinedPdfFileName);

                PolicyService_bajaj.generatePolicy_bajaj(Policyno, policyData, originalPdfPath, combinepdfurl, async (err, result) => {
                    if (err) {
                        logger.error('Policy generation error:', err);
                        return base.send_response("Error generating policy documents: " + err.message, { count: results.length, proposals: results }, res, 500);
                    }

                    const certificateId = Policyno;

                    // ====================================================================
                    // Format File Name and Move to correct folder (welcome-letters-bajaj)
                    // ====================================================================
                    const actualGeneratedPath = path.resolve(result.pdfPath || originalPdfPath);
                    const actualRawFileName = path.basename(actualGeneratedPath);

                    const pdfFileName = actualRawFileName.startsWith('Welcome-letters-')
                        ? actualRawFileName
                        : `Welcome-letters-${actualRawFileName}`;

                    const newWelcomeLetterPath = path.join(welcomeLetterDir, pdfFileName);

                    if (!fs.existsSync(welcomeLetterDir)) {
                        fs.mkdirSync(welcomeLetterDir, { recursive: true });
                    }

                    if (fs.existsSync(actualGeneratedPath) && actualGeneratedPath !== newWelcomeLetterPath) {
                        fs.renameSync(actualGeneratedPath, newWelcomeLetterPath);
                        logger.info(`Moved welcome letter to ${newWelcomeLetterPath}`);
                    }

                    const pdfUrl = `/welcome-letters-bajaj/${pdfFileName}`;

                    // LOG: Welcome Letter Generated successfully
                    await logBajajApiActivity("WELCOME_LETTER_GEN",
                        { policyNo: Policyno },
                        { message: "Welcome Letter Generated Successfully", savedPath: newWelcomeLetterPath, dbUrl: pdfUrl },
                        null
                    );

                    const bajajDbUrl = policyData.BajajgivenpolicyUrl || '';

                    let finalMergedUrl = null;

                    // 2. Safely Attempt PDF Merge
                    try {
                        if (bajajDbUrl) {
                            const { PDFDocument } = require('pdf-lib');
                            const welcomeLetterPath = newWelcomeLetterPath;

                            let normalizedBajajUrl = bajajDbUrl.replace(/^\/?(public\/)?/, '');
                            const bajajPolicyPath = path.join(publicDir, normalizedBajajUrl);

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
                                finalMergedUrl = combinepdfurl;

                                // LOG: PDF Merge Success
                                await logBajajApiActivity("PDF_MERGE",
                                    { welcomeLetterInput: welcomeLetterPath, bajajPolicyInput: bajajPolicyPath },
                                    { message: "PDFs Merged Successfully", savedPath: finalCombinedPath, dbUrl: finalMergedUrl },
                                    null
                                );

                            } else {
                                logger.warn('Original Bajaj Policy or Welcome Letter not found on disk. Skipping merge.');
                                await logBajajApiActivity("PDF_MERGE", { policyNo: Policyno }, null, "Missing input file(s) on disk. Skipping merge.");
                            }
                        } else {
                            logger.warn('No BajajgivenpolicyUrl found in DB. Skipping merge.');
                            await logBajajApiActivity("PDF_MERGE", { policyNo: Policyno }, null, "No BajajgivenpolicyUrl found in DB. Skipping merge.");
                        }
                    } catch (mergeError) {
                        logger.error(`Error merging PDFs: ${mergeError.message}`);
                        await logBajajApiActivity("PDF_MERGE", { policyNo: Policyno }, null, `Error merging PDFs: ${mergeError.message}`);
                    }

                    // 3. ALWAYS Update the Database
                    try {

                        const finalDbPdfUrl = finalMergedUrl;

                        const updateQuery = `UPDATE Bajaj_Travel_Proposal_main SET PolicypdfUrl = ?, Main_Bajaj_Policy_Url = IFNULL(?, Main_Bajaj_Policy_Url) WHERE PolicyNo = ?`;
                        const [updateResult] = await db.query(updateQuery, [pdfUrl, finalMergedUrl, certificateId]);

                        if (updateResult.affectedRows > 0) {
                            logger.info(`Successfully updated PolicypdfUrl in proposal_main for certificate: ${certificateId}`);
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

            if (!empId) {
                return base.send_response(
                    "Employee ID is required",
                    null,
                    res,
                    400
                );
            }

            const [rows] = await db.query(
                'CALL getProposalDetailsByEmployee_bajaj(?,?,?)',
                [empId, startdate, enddate]
            );

            const results = rows[0];

            if (results && results.length > 0) {
                base.send_response(
                    "Proposal details retrieved successfully",
                    {
                        count: results.length,
                        proposals: results
                    },
                    res
                );
            } else {
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

            if (!Policyno) {
                return base.send_response(
                    "Policy No is required",
                    null,
                    res,
                    400
                );
            }

            const [rows] = await db.query(
                'CALL getPolicyDetailsbyPolicyno_bajaj(?)',
                [Policyno]
            );

            const results = rows[0];

            if (results && results.length > 0) {
                base.send_response(
                    "Policy details retrieved successfully",
                    {
                        count: results.length,
                        proposals: results
                    },
                    res
                );
            } else {
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

            if (!policyNo || !UID || !Name || !AgentId || !proposal_id || !Premium) {
                return base.send_response(
                    "Missing required fields: policyNo, UID, Name, AgentId, proposal_id, Premium",
                    null,
                    res,
                    400
                );
            }

            logger.info(`Cancelling policy: ${policyNo}, proposal_id: ${proposal_id}`);

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


    // ============================================================
    // BAJAJ ALLIANZ — Fixed bajajlivepdf controller method
    // 
    // KEY FIXES based on Bajaj email + log analysis:
    // 
    // FIX 1 — Token: password was missing from --data-urlencode
    //          Added: password: 'newpas1' to URLSearchParams body
    //
    // FIX 2 — PDF headers: Bajaj uses 'auth: Bearer <token>'
    //          NOT 'Authorization: Bearer'
    //          NOT 'Authorization: Basic Og=='
    //
    // FIX 3 — responseType: 'text' because Bajaj returns a
    //          raw base64 string (not JSON, not binary buffer)
    //          Log showed: dataType:"string", rawSnippet:"..."
    //          The "..." means the string was empty/whitespace —
    //          fixed by reading it as plain text first
    // ============================================================

    async bajajlivepdf(req, res) {
        try {
            const { policyNo } = req.body;
            if (!policyNo) {
                return base.send_response("Policy Number is required", null, res, 400);
            }

            logger.info(`[BAJAJ LIVE PDF] Initiating download for policy: ${policyNo}`);

            // ─────────────────────────────────────────────────────
            // STEP 1 — Get OAuth Token
            // FIX: password must be in --data-urlencode body, NOT headers
            // ─────────────────────────────────────────────────────
            const tokenPayload = new URLSearchParams({
                grant_type: 'password',
                client_id: 'B2BService_Client',
                client_secret: '0299dec1-fb95-45a8-8770-ca9537fc252c',
                username: 'webservice@policyboss.com',
                password: 'password',               // ← FIX 1: was missing from body
            }).toString();

            const tokenResponse = await axios.post(
                'https://auth.prod.bajajgeneral.com/auth/realms/Bagic/protocol/openid-connect/token',
                tokenPayload,
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    httpsAgent
                }
            );

            const accessToken = tokenResponse.data.access_token;
            if (!accessToken) {
                throw new Error("No access token returned from Bajaj auth API");
            }

            logger.info(`[BAJAJ LIVE PDF] Token received: ${accessToken.substring(0, 20)}...[OK]`);
            await logBajajApiActivity("BAJAJ_OAUTH_TOKEN", { grant_type: 'password', client_id: 'B2BService_Client', username: 'webservice@policyboss.com', password: '***' }, { success: true }, null);

            // ─────────────────────────────────────────────────────
            // STEP 2 — Download PDF
            // FIX 2: Bajaj needs 'auth: Bearer <token>' header (their custom header)
            // FIX 3: responseType: 'text' — Bajaj returns raw base64 string, not binary
            // ─────────────────────────────────────────────────────
            const pdfDownloadUrl = `https://pit.bajajallianz.com/bjazDownload/travel/downloadPdf/${policyNo}`;

            logger.info(`[BAJAJ LIVE PDF] Calling PDF URL: ${pdfDownloadUrl}`);

            const pdfResponse = await axios.get(pdfDownloadUrl, {
                headers: {
                    'auth': `Bearer ${accessToken}`,  // ← FIX 2: Bajaj custom header
                    'Authorization': `Bearer ${accessToken}`,  // keep both just in case
                },
                responseType: 'text',                          // ← FIX 3: expect base64 string
                httpsAgent
            });

            // ─────────────────────────────────────────────────────
            // STEP 3 — Parse the response
            // Bajaj can return:
            //   a) Plain base64 string
            //   b) JSON: { "file": "base64..." }
            //   c) JSON: { "p_pdf_string": "base64..." }
            //   d) Quoted string: "\"base64...\""
            // ─────────────────────────────────────────────────────
            let rawData = pdfResponse.data;

            logger.info(`[BAJAJ LIVE PDF] Response type: ${typeof rawData}, length: ${rawData?.length}`);
            await logBajajApiActivity("BAJAJ_PDF_RAW_RESPONSE", { url: pdfDownloadUrl }, {
                dataType: typeof rawData,
                length: rawData?.length,
                rawSnippet: typeof rawData === 'string' ? rawData.substring(0, 200) : JSON.stringify(rawData).substring(0, 200)
            }, null);

            let pdfBase64 = rawData;

            // Try parsing as JSON first
            if (typeof pdfBase64 === 'string') {
                const trimmed = pdfBase64.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        pdfBase64 = parsed.downloadedPdf    // ← Bajaj confirmed key
                            || parsed.file
                            || parsed.p_pdf_string
                            || parsed.data
                            || parsed.pdf
                            || parsed.base64
                            || null;
                        if (!pdfBase64) {
                            throw new Error(`JSON response received but no known key found. Keys: ${Object.keys(parsed).join(', ')}`);
                        }
                    } catch (parseErr) {
                        throw new Error(`Failed to parse JSON response: ${parseErr.message}`);
                    }
                }
            }

            // Handle object response (axios auto-parsed JSON despite responseType:'text')
            if (typeof pdfBase64 === 'object' && pdfBase64 !== null) {
                pdfBase64 = pdfBase64.downloadedPdf    // ← Bajaj confirmed key
                    || pdfBase64.file
                    || pdfBase64.p_pdf_string
                    || pdfBase64.data
                    || pdfBase64.pdf
                    || null;
            }

            // Strip surrounding quotes  "base64string" → base64string
            if (typeof pdfBase64 === 'string') {
                pdfBase64 = pdfBase64.trim().replace(/^"|"$/g, '');
            }

            if (!pdfBase64 || pdfBase64.length < 100) {
                throw new Error(`Invalid or empty base64 received. Length: ${pdfBase64?.length}. Raw: ${String(rawData).substring(0, 300)}`);
            }

            // ─────────────────────────────────────────────────────
            // STEP 4 — Convert base64 → PDF buffer → Save to disk
            // ─────────────────────────────────────────────────────
            const pdfBuffer = Buffer.from(pdfBase64, 'base64');

            // Validate it's actually a PDF (starts with %PDF)
            const pdfHeader = pdfBuffer.slice(0, 4).toString('ascii');
            if (pdfHeader !== '%PDF') {
                throw new Error(`Decoded data is not a valid PDF. Header bytes: "${pdfHeader}". Base64 length was: ${pdfBase64.length}`);
            }

            const bajajFolder = path.join(__dirname, '../public/policygivenbyBajaj');
            if (!fs.existsSync(bajajFolder)) {
                fs.mkdirSync(bajajFolder, { recursive: true });
            }

            const cleanPolicyNo = policyNo.replace(/[^a-zA-Z0-9]/g, '');
            const bajajPdfFileName = `bajaj${cleanPolicyNo}.pdf`;
            const physicalBajajPath = path.join(bajajFolder, bajajPdfFileName);
            const dbUrl = `/policygivenbyBajaj/${bajajPdfFileName}`;

            fs.writeFileSync(physicalBajajPath, pdfBuffer);
            logger.info(`[BAJAJ LIVE PDF] Saved: ${physicalBajajPath} (${pdfBuffer.length} bytes)`);

            // ─────────────────────────────────────────────────────
            // STEP 5 — Update DB
            // ─────────────────────────────────────────────────────
            await db.query(
                `UPDATE Bajaj_Travel_Proposal_main SET Main_Bajaj_Policy_Url = ? WHERE PolicyNo = ?`,
                [dbUrl, policyNo]
            );

            await logBajajApiActivity("BAJAJ_PDF_DOWNLOAD_SUCCESS", { policyNo }, { savedPath: physicalBajajPath, dbUrl, sizeBytes: pdfBuffer.length }, null);

            return base.send_response("Bajaj PDF Downloaded Successfully", { dbUrl }, res);

        } catch (error) {
            let errMsg = error.message;
            if (error.response?.data) {
                const errData = Buffer.isBuffer(error.response.data)
                    ? error.response.data.toString()
                    : JSON.stringify(error.response.data);
                errMsg += ` | HTTP ${error.response.status} | Details: ${errData.substring(0, 500)}`;
            }
            logger.error(`[BAJAJ LIVE PDF ERROR]: ${errMsg}`);
            await logBajajApiActivity("BAJAJ_PDF_DOWNLOAD_ERROR", { policyNo: req.body.policyNo }, null, errMsg);
            return base.send_response(`Failed to download Bajaj PDF: ${errMsg}`, null, res, 500);
        }
    }

    async getCityByPincode_bajaj(req, res) {
        try {
            const { pincode } = req.body;

            if (!pincode) {
                return base.send_response("Pincode is required", null, res);
            }

            const url = "https://pit.bajajgeneral.com/BjazTravelWebServices/getCitybyPincode";

            logger.info(`Fetching Bajaj city details for pincode: ${pincode}`);

            const response = await axios.post(url, { pincode: pincode }, {
                headers: {
                    'Content-Type': 'application/json'
                },
                httpsAgent: httpsAgent // Uses the agent already defined at the top of your controller
            });

            return base.send_response("City details fetched successfully", response.data, res);

        } catch (error) {
            let errMsg = error.message;
            if (error.response?.data) {
                errMsg += ` | Details: ${JSON.stringify(error.response.data)}`;
            }
            logger.error(`[BAJAJ PINCODE ERROR]: ${errMsg}`);

            return base.send_response(`Failed to fetch city details: ${error.message}`, null, res);
        }
    }


    // Add this method inside BajajController class in BajajController.js
    async UpdateBajajProposer_policy(req, res) {
        try {
            const {
                PolicyNo, ProposerTitle, ProposerFirstName, ProposerMiddleName,
                ProposerLastName, ProposerGender, ProposerPassport,
                AddressLine1, PinCode, CityName, State
            } = req.body;

            if (!PolicyNo) {
                return base.send_response("Policy Number is required", null, res, "Failure", 1);
            }

            // Call the Stored Procedure
            const [result] = await db.query(
                'CALL UpdateBajajProposerDetails(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    PolicyNo, ProposerTitle, ProposerFirstName, ProposerMiddleName,
                    ProposerLastName, ProposerGender, ProposerPassport,
                    AddressLine1, PinCode, CityName, State
                ]
            );

            // result[0][0] contains the SELECT statement from the SP
            const spResult = result[0][0];

            if (spResult && spResult.Status && spResult.Status.trim() === 'Success') {
                //base.send_response(spResult.Message, null, res);             
                base.send_response(
                    spResult.Message,
                    "Success",
                    res

                );
            } else {
                // If Status isn't 'Success', return the actual message provided by the DB
                base.send_response(spResult.Message || "Update failed", null, res, "Failure", 1);
            }
        } catch (error) {
            logger.error('UpdateBajajProposer_policy Error:', error);
            base.send_response("Error updating proposer details", null, res, "Error", 1);
        }
    }

    async Excel_InsertBajajTravelProposal(req, res) {
        try {
            const data = req.body;

            // Validate critical fields
            if (!data.PolicyNo || !data.AgentId) {
                return base.send_response("Policy Number and Agent ID are required", null, res, "Failure", 1);
            }

            const formattedStartDate = (data.StartDate);
            const formattedEndDate = (data.EndDate);
            const formattedTrv_DOB = (data.Trv_DOB);

            // Map data to the Stored Procedure Parameters (Must match the 37 SP parameters exactly)
            const params = [
                data.AgentId || '',
                data.UId || '',
                data.Asnumber_bajaj || '',
                data.PolicyNo,
                data.GeographicalCover || '',
                data.CountryName || '',
                formattedStartDate,
                formattedEndDate,
                data.JourneyFromDate || null,
                data.JourneyToDate || null,
                data.NoOfDays || 0,
                data.FinalPremium || 0,
                data.Selected_PremiumAmount || '0',
                data.Actual_PremiumAmount || '0',
                data.gstamount || '0',
                data.commission_agentamount || '0',
                data.Premium_without_gst || '0',
                data.Payout_Bajaj || '0',
                data.Selected_Payment_Mode || '',
                data.Prop_Pincode || '',
                data.Prop_State || '',
                data.Prop_City || '',
                data.Prop_Address || '',
                data.Prop_Email || '',
                data.Prop_Mobile || '',
                data.Trv_Title || '',
                data.Trv_Gender || '',
                data.Trv_FirstName || '',
                data.Trv_MiddleName || '',
                data.Trv_LastName || '',
                formattedTrv_DOB,
                data.Trv_Passport || '',
                data.Trv_RelationWithProposer || '',
                data.Trv_NomineeName || '',
                data.Trv_NomineeRelation || '',
                data.Trv_Email || '',
                data.Trv_Mobile || '',
                data.Trv_PreExistingDisease || 'No'
            ];

            // Execute the Stored Procedure (37 parameters)
            const [result] = await db.query(
                `CALL sp_Excel_InsertBajajTravelProposal(
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
                    ?, ?, ?, ?, ?, ?, ?,?
                )`,
                params
            );

            let currentErpStatus = 'Pending';
            if (result && result[0] && result[0][0] && result[0][0].ERP_Status) {
                currentErpStatus = result[0][0].ERP_Status;
            }

            // Reflected UPSERT logic in response message
            base.send_response(
                "Proposal inserted/updated successfully",
                { policyNo: data.PolicyNo, erpStatus: currentErpStatus },
                res,
                "Success",
                0
            );

        } catch (error) {
            logger.error('Excel_InsertBajajTravelProposal Error:', error);

            // Adjust error handling since native duplicate constraint is now handled by SP logic
            let errorMsg = error.message || "Error processing proposal";
            if (error.code === 'ER_DUP_ENTRY') {
                errorMsg = `Duplicate entry constraint failed for Policy No: ${req.body.PolicyNo}`;
            }

            base.send_response(errorMsg, null, res, "Error", 1);
        }
    }

    // Add this new method inside BajajController class
    async uploadBajajManualPdf(req, res) {
        try {
            const { policyNo, pdfBase64 } = req.body;

            if (!policyNo || !pdfBase64) {
                return base.send_response("Policy Number and PDF file are required", null, res, "Failure", 1);
            }

            // 1. Strip the base64 prefix sent by React (e.g., "data:application/pdf;base64,")
            const base64Data = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
            const pdfBuffer = Buffer.from(base64Data, 'base64');

            // 2. Exact folder path and naming convention you requested
            const bajajFolder = path.join(__dirname, '../public/policygivenbyBajaj');

            // Create folder if it doesn't exist
            if (!fs.existsSync(bajajFolder)) {
                fs.mkdirSync(bajajFolder, { recursive: true });
            }

            const cleanPolicyNo = policyNo.replace(/[^a-zA-Z0-9]/g, '');
            const bajajPdfFileName = `bajaj${cleanPolicyNo}.pdf`;
            const physicalBajajPath = path.join(bajajFolder, bajajPdfFileName);
            const dbUrl = `/policygivenbyBajaj/${bajajPdfFileName}`;

            // 3. Write file to disk
            fs.writeFileSync(physicalBajajPath, pdfBuffer);
            logger.info(`[BAJAJ MANUAL PDF] Saved: ${physicalBajajPath} (${pdfBuffer.length} bytes)`);

            // 4. Update the Database with the URL and set ERP_Status to 'Success'
            const updateQuery = `
                UPDATE Bajaj_Travel_Proposal_main 
                SET BajajgivenpolicyUrl = ?, ERP_Status = 'Success' 
                WHERE PolicyNo = ?
            `;
            await db.query(updateQuery, [dbUrl, policyNo]);

            return base.send_response("PDF Uploaded and ERP Status Updated to Success", { dbUrl }, res, "Success", 0);

        } catch (error) {
            logger.error(`[BAJAJ MANUAL PDF ERROR]: ${error.message}`);
            return base.send_response("Error uploading PDF", null, res, "Error", 1);
        }
    }
}

module.exports = new BajajController();