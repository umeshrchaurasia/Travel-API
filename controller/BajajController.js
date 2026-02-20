// controller/BajajController.js
const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');
const axios = require('axios');
const https = require('https');

// Configuration
const BAJAJ_CONFIG = {
    URL: "https://htsoapapi.bagicpp.bajajallianz.com/BjazTravelWebServices/SaveMasterplan",
    USERID: "webservice@policyboss.com",
    PASSWORD: "Bagic123",
    MASTER_POLICY_NO: "12-9911-0006640459-00",
    PRODUCT_CODE: "9911"
};

// HTTPS Agent to prevent socket hang-ups
const httpsAgent = new https.Agent({ keepAlive: false, rejectUnauthorized: false });

// Configured Axios Client
const bajajClient = axios.create({
    httpsAgent: httpsAgent,
    headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
    timeout: 45000
});

// Helper: Format Date dd/mm/yyyy -> yyyy-mm-dd for MySQL
const formatToDbDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return null;
};

class BajajController {

    /**
     * Step 1: Calculate Premium
     * - Calls Bajaj API (CALC_PREM)
     * - Returns QuoteNo and PremiumDetails to Frontend
     * - DOES NOT Save to DB
     */
    saveMasterPlan_calc = async (req, res) => {
        try {
            const {
                StartDate, EndDate, JourneyFromDate, JourneyToDate, NoOfDays,
                Plan, GeographicalCover, CountryName, 
                TravellerDetails, ProposerDetails, TripType 
            } = req.body;

            // 1. Build Payload
            const bajajPayload = {
                "pUserId": BAJAJ_CONFIG.USERID,
                "pPassword": BAJAJ_CONFIG.PASSWORD,
                "pServiceMode": "CALC_PREM", 
                "pPayMode": "AFLOAT",
                "pQuoteNo": "", // Empty for Calc
                "familyflag": "N",
                "pTravelPlanDtlsList": {
                    "productCode": BAJAJ_CONFIG.PRODUCT_CODE,
                    "Product": "GROUP TRAVEL",
                    "StartDate": StartDate, 
                    "EndDate": EndDate,
                    "masterPolicyNumber": BAJAJ_CONFIG.MASTER_POLICY_NO,
                    "Plan": Plan || "TPHGLD",
                    "geographicalCover": GeographicalCover || "Worldwide Including USA and Canada",
                    "countryName": CountryName || "India",
                    "pJourneryDtls": {
                        "fromDate": JourneyFromDate || StartDate,
                        "toDate": JourneyToDate || EndDate,
                        "noOfDays": NoOfDays
                    }
                },
                "pTravellerDtls": TravellerDetails,
                "pProposerDtls": ProposerDetails,
                "pTripDetails": { ...TripType }
            };

            // 2. Call API
            const apiResponse = await bajajClient.post(BAJAJ_CONFIG.URL, bajajPayload);
            const responseData = apiResponse.data;

            // 3. Check Error
            if (responseData?.applicationError?.errorCode !== "0") {
                throw new Error(responseData?.applicationError?.errorDescription || "Bajaj Calc Error");
            }

            // 4. Return Data to Frontend (No DB Insert)
            return base.send_response("Premium Calculated.", {
                pQuoteNo: responseData.pQuoteNo,
                pPremiumDtls: responseData.pPremiumDtls,
                pPolicyData: responseData.pPolicyData,
                applicationError: responseData.applicationError
            }, res, "Success");

        } catch (error) {
            logger.error('Bajaj Calc Error:', error);
            const apiMsg = error.response?.data?.applicationError?.errorDescription || error.message;
            return base.send_response("Error calculating premium.", apiMsg, res, "Error", 500);
        }
    }

    /**
     * Step 2: Issue Policy
     * - Accepts QuoteNo from Frontend
     * - Calls Bajaj API (ISSUE_POLICY)
     * - SAVES everything to DB (Proposal, Proposer, Travellers)
     * - Returns specific AgentId, PolicyNo, Dates, Premiums
     */
    saveMasterPlan_ISSUE_POLICY = async (req, res) => {
        try {
            const {
                AgentId, QuoteNo, 
                StartDate, EndDate, JourneyFromDate, JourneyToDate, NoOfDays,
                Plan, GeographicalCover, CountryName, 
                TravellerDetails, ProposerDetails, TripType 
            } = req.body;

            if (!AgentId || !QuoteNo) {
                return base.send_response("AgentId and QuoteNo are required.", null, res, "Error", 400);
            }

            // 1. Build Payload (Same as Calc, but with QuoteNo & ISSUE_POLICY)
            const bajajPayload = {
                "pUserId": BAJAJ_CONFIG.USERID,
                "pPassword": BAJAJ_CONFIG.PASSWORD,
                "pServiceMode": "ISSUE_POLICY", 
                "pPayMode": "AFLOAT",
                "pQuoteNo": QuoteNo,
                "familyflag": "N",
                "pTravelPlanDtlsList": {
                    "productCode": BAJAJ_CONFIG.PRODUCT_CODE,
                    "Product": "GROUP TRAVEL",
                    "StartDate": StartDate, 
                    "EndDate": EndDate,
                    "masterPolicyNumber": BAJAJ_CONFIG.MASTER_POLICY_NO,
                    "Plan": Plan || "TPHGLD",
                    "geographicalCover": GeographicalCover || "Worldwide Including USA and Canada",
                    "countryName": CountryName || "India",
                    "pJourneryDtls": {
                        "fromDate": JourneyFromDate || StartDate,
                        "toDate": JourneyToDate || EndDate,
                        "noOfDays": NoOfDays
                    }
                },
                "pTravellerDtls": TravellerDetails,
                "pProposerDtls": ProposerDetails,
                "pTripDetails": { ...TripType }
            };

            // 2. Call API
            const apiResponse = await bajajClient.post(BAJAJ_CONFIG.URL, bajajPayload);
            const responseData = apiResponse.data;

            if (responseData?.applicationError?.errorCode !== "0") {
                throw new Error(responseData?.applicationError?.errorDescription || "Bajaj Issue Error");
            }

            // Extract API Response Values
            const resultPolicyNo = responseData.pPolicyData?.policy_no || "PENDING";
            // Note: If API doesn't return premium on Issue, use 0.00
            const resultPremium = responseData.pPremiumDtls?.finalPremium || 0; 
            const basePrem = responseData.pPremiumDtls?.basePrem || 0;

            // 3. DB Insert: Header (Proposal + Proposer) via Stored Procedure
            const headerParams = [
                AgentId, "ISSUE_POLICY", QuoteNo, resultPolicyNo,
                Plan, GeographicalCover, CountryName,
                formatToDbDate(StartDate), formatToDbDate(EndDate),
                formatToDbDate(JourneyFromDate), formatToDbDate(JourneyToDate), NoOfDays,
                basePrem, resultPremium,
                JSON.stringify(bajajPayload), JSON.stringify(responseData),
                // Proposer Details
                ProposerDetails.beforeTitle, ProposerDetails.firstName, ProposerDetails.LastName,
                formatToDbDate(ProposerDetails.dateOfBirth), ProposerDetails.emailId, ProposerDetails.mobileNumber,
                ProposerDetails.gender, ProposerDetails.Address, ProposerDetails.City, ProposerDetails.State, 
                ProposerDetails.Pincode, ProposerDetails.passportNumber
            ];

            const [headerRows] = await db.query(
                'CALL sp_SaveBajajTransaction_Header(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                headerParams
            );
            
            const dbResult = headerRows[0][0];
            const newBajajId = dbResult.BajajId;

            // 4. DB Insert: Travellers (Loop through Array & Call SP for each)
            if (newBajajId && TravellerDetails && TravellerDetails.length > 0) {
                
                // Use Promise.all to execute inserts in parallel for performance
                const travellerPromises = TravellerDetails.map(t => {
                    const trvParams = [
                        newBajajId,
                        AgentId,
                        t.beforeTitle,
                        t.gender,
                        t.firstName,
                        t.middleName || '',
                        t.LastName,
                        formatToDbDate(t.dateOfBirth),
                        t.relationWithProposer,
                        t.passportNumber,
                        t.nomineeName,
                        t.nomineeRelation,
                        t.trvEmailId,
                        t.trvMobileNumber,
                        t.anyPreExistingDisease || 'No'
                    ];

                    return db.query(
                        'CALL sp_SaveBajajTraveller(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                        trvParams
                    );
                });

                await Promise.all(travellerPromises);
                console.log(`Bajaj: Inserted ${TravellerDetails.length} travellers for ID ${newBajajId}`);
            }

            // 5. Return Specific Success Response
            return base.send_response("Policy Issued Successfully.", {
                AgentId: AgentId,
                PolicyNo: resultPolicyNo,
                StartDate: StartDate, // Return original format
                EndDate: EndDate,     // Return original format
                BasePremium: basePrem,
                FinalPremium: resultPremium,
                dbId: newBajajId
            }, res, "Success");

        } catch (error) {
            logger.error('Bajaj Issue Error:', error);
            const apiMsg = error.response?.data?.applicationError?.errorDescription || error.message;
            return base.send_response("Error issuing policy.", apiMsg, res, "Error", 500);
        }
    }
}

module.exports = new BajajController();