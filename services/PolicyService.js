// services/PolicyService.js
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const puppeteer = require('puppeteer');
const logger = require('../bin/Logger');

const base64Images = require('./Base64Images');

class PolicyService {
  constructor() {
    this.pdfStorePath = './public/policy/';
    this.htmlStorePath = './public/html/';
    this.qrCodeStorePath = './public/qrcodes/';
    this.templatesPath = path.join(__dirname, '../views/templates');
    this.ensureDirectories();

    this.ContactImageBase64 = base64Images.ContactImageBase64;
    this.EuropImageBase64 = base64Images.EuropImageBase64;
    this.LogoImageBase64 = base64Images.LogoImageBase64;
    this.SignImageBase64 = base64Images.SignImageBase64;
    this.WatermarkImageBase64 = base64Images.WatermarkImageBase64;
    this.LogotravelImageBase64 = base64Images.LogotravelImageBase64;
    this.Travel_signImageBase64 = base64Images.Travel_signImageBase64;
    this.techtravelImageBase64 = base64Images.techtravelImageBase64;

    this.arrowImageBase64 = base64Images.arrowImageBase64;
    this.phoneImageBase64 = base64Images.phoneImageBase64;
    this.whatsupImageBase64 = base64Images.whatsupImageBase64;

    // You'd add scanner image base64 here too if needed
    this.ScannerImageBase64 = ""; // Add your base64 string here
  }

  ensureDirectories() {
    [this.pdfStorePath, this.htmlStorePath, this.qrCodeStorePath].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  async generatePolicy(policyNo, policyData, callback) {
    try {
      const processed = this.preparePolicyData(policyData);
      const timestamp = Date.now();
      const pdfPath = path.join(this.pdfStorePath, `${policyNo}_${timestamp}.pdf`);
      const htmlPath = path.join(this.htmlStorePath, `${policyNo}.html`);
      const qrPath = path.join(this.qrCodeStorePath, `${policyNo}-qr.png`);

      const qrCodeData = this.generateQRCodeData(processed);
      await QRCode.toFile(qrPath, qrCodeData, { errorCorrectionLevel: 'H', width: 180 });
      const qrCodeBase64 = await this.imageToBase64(qrPath);
      processed.qrCodeBase64 = qrCodeBase64;

      // Add base64 images directly instead of file URLs
      processed.watermarkBase64 = this.WatermarkImageBase64;
      processed.logoBase64 = this.LogoImageBase64;
      processed.scannerBase64 = this.ScannerImageBase64;
      processed.contactBase64 = this.ContactImageBase64;
      processed.signBase64 = this.SignImageBase64;
      processed.europBase64 = this.EuropImageBase64;
      processed.logotravelimageBase64 = this.LogotravelImageBase64;
      processed.travel_signImageBase64 = this.Travel_signImageBase64;
      processed.techtravelImageBase64 = this.techtravelImageBase64;

      processed.arrowImageBase64 = this.arrowImageBase64;
      processed.phoneImageBase64 = this.phoneImageBase64;
      processed.whatsupImageBase64 = this.whatsupImageBase64;

      // Process the coverage data if it exists in policyData.coverageDetails
      if (policyData.coverageDetails && Array.isArray(policyData.coverageDetails)) {
        this.processCoverageData(processed, policyData.coverageDetails);
      }

      const templatePath = path.join(this.templatesPath, 'coi-template-new.ejs');
      const renderedHtml = await ejs.renderFile(templatePath, { policy: processed });

      await fs.promises.writeFile(htmlPath, renderedHtml);

      const browser = await puppeteer.launch({
        headless: true,
        executablePath: puppeteer.executablePath(),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--single-process',
          '--window-size=1920,1080',
          '--hide-scrollbars'
        ]
      });

      const page = await browser.newPage();

      // Set longer timeout for content loading
      await page.setDefaultNavigationTimeout(60000);

      // Add error handler
      page.on('error', err => {
        logger.error(`Puppeteer page error: ${err}`);
      });

      // Add console logging from the page for debugging
      page.on('console', msg => {
        logger.info(`Page console: ${msg.text()}`);
      });

      await page.setContent(renderedHtml, {
        waitUntil: 'networkidle0',
        timeout: 60000
      });

      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
      });

      await browser.close();

      callback(null, {
        pdfPath,
        htmlPath,
        qrCodePath: qrPath,
        htmlContent: renderedHtml,
        processedData: processed
      });

    } catch (error) {
      logger.error('Error generating policy:', error);
      callback(error, null);
    }
  }

  processCoverageData(policyData, coverageDetails) {
    logger.info(`Processing ${coverageDetails.length} coverage details`);

    // Create a map for easier access to coverage values
    const coverageMap = {};

    // Process each coverage detail and store in the map
    coverageDetails.forEach(item => {
      if (item.coverage && item.sum_insured) {
        coverageMap[item.coverage.trim()] = item.sum_insured;
        logger.info(`Mapping coverage: "${item.coverage.trim()}" to value: "${item.sum_insured}"`);
      }
    });

    // Map all coverage fields that are used in the EJS template

    // Medical coverage (primary coverage)
    policyData.MedicalExpenses = coverageMap['Medical Expenses Including Transportation, Evacuation & Repatriation of Mortal Remains'] || '';

    // Daily allowance and other dynamic fields in the first table
    policyData.DailyAllowance = coverageMap['Daily Allowance in case of Hospitalization'] || '';
    policyData.Hijack = coverageMap['Hijack Distress Allowance'] || '';
    policyData.TripDelay = coverageMap['Trip Delay'] || '';
    policyData.TripCancellation = coverageMap['Trip Cancellation & Interruption'] || '';
    policyData.Missed = coverageMap['Missed Connection'] || '';

    // Fields from the second table
    policyData.HomeBurglary = coverageMap['Home Burglary Insurance'] || '';
    // Also check for the alternate name with "(Amount in Indian Rs)" suffix
    if (!policyData.HomeBurglary || policyData.HomeBurglary === '') {
      policyData.HomeBurglary = coverageMap['Home Burglary Insurance (Amount in Indian Rs)'] || '';
    }

    policyData.PersonalAccident = coverageMap['Personal Accident'] || '';
    policyData.AccidentalDeath = coverageMap['Accidental Death – Common Carrier'] || '';

    // Check for various possible names for "Any one illness"
    policyData.AnyOneIllness = coverageMap['Any One Illness (71–80 yrs)'] || '';

    // Check for various possible names for "Any one Accident"
    policyData.AnyOneAccident = coverageMap['Any One Accident (71–80 yrs)'] || '';

    // Additional coverages from the first table that need to be dynamically rendered
    policyData.DentalTreatment = '500';
    policyData.LossOfPassport = '300';
    policyData.TotalLossOfCheckedBaggage = '1000';
    policyData.DelayOfCheckedBaggage = '100';
    policyData.PersonalLiability = '25000';
    policyData.CompassionateVisit = 'Return Fare for any one accompanying person - spouse / child / family doctor';

    // If we have raw coverage details, store them as well for any custom rendering needs
    policyData.rawCoverageDetails = coverageDetails;

    // For debugging
    logger.info('Processed coverage data:');
    logger.info(`Medical Expenses: ${policyData.MedicalExpenses}`);
    logger.info(`Daily Allowance: ${policyData.DailyAllowance}`);
    logger.info(`Dental Treatment: ${policyData.DentalTreatment}`);
    logger.info(`Loss of Passport: ${policyData.LossOfPassport}`);
    logger.info(`Home Burglary: ${policyData.HomeBurglary}`);
    logger.info(`Personal Accident: ${policyData.PersonalAccident}`);
    logger.info(`Any One Illness: ${policyData.AnyOneIllness}`);
    logger.info(`Any One Accident: ${policyData.AnyOneAccident}`);

    return policyData;
  }

  async imageToBase64(imagePath) {
    try {
      const img = await fs.promises.readFile(imagePath);
      const mime = path.extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${img.toString('base64')}`;
    } catch (error) {
      logger.error(`Error converting image to base64: ${error.message}`);
      return null;
    }
  }

  preparePolicyData(policyData) {
    const formatDate = (d) => {
      if (!d) return 'N/A';
      const date = new Date(d);
      return `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
    };

    const today = new Date();

    const formatnewDate = (d) => {
      if (!d) return 'N/A';
      const date = new Date(d);
      const day = date.getDate().toString().padStart(2, '0');
      const month = date.toLocaleString('en-US', { month: 'short' }); // e.g., Jan, Feb
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };

    const geoLocation = (planName = '') => {
      return planName.includes('TRAVEL INCL USA & CANADA')
        ? 'WW INCL USA & CANADA'
        : 'WW EXCL USA & CANADA';
    }

    return {
      ...policyData,
      // Basic policy information
      Policy_No: policyData.Policy_No || '',
      NameofPlan: policyData.NameofPlan || 'N/A',
      Geographical: geoLocation(policyData.NameofPlan),

      Product_Code: policyData.Product_Code || 'N/A',
      day_of_difference: policyData.day_of_difference || 'N/A',
      PlanAmount: policyData.PlanAmount || '',

      // Contact information
      LandLineNumber: policyData.LandLineNumber || '',
      CountryVisiting: policyData.CountryVisiting || '',
      EmailID: policyData.EmailID || '',
      MobileNumber: policyData.MobileNumber || '',

      // Intermediatory information
      IntermediatoryDepartmentName: policyData.IntermediatoryDepartmentName || '',
      IntermediatoryBranchCode: policyData.IntermediatoryBranchCode || '',
      Agent_Code: policyData.Agent_Code || '',
      PSONumber: policyData.PSONumber || '',
      NOPSONumber: (policyData.PSONumber || '').replace(/^PSO-/, ''),
      SenderName: policyData.SenderName || '',

      // Personal information
      PassportNo: policyData.PassportNo || '',
      Gender: policyData.Gender || '',
      DateOfBirth: policyData.DateOfBirth || '',

      // Nominee information
      NomineeName: policyData.NomineeName || '',
      RelationshipOfTheNomineeWithInsured: policyData.RelationshipOfTheNomineeWithInsured || '',

      // Medical information
      SufferingFromAnyPreExistingDisease: policyData.SufferingFromAnyPreExistingDisease || '',
      NameOfDiseases: policyData.NameOfDiseases || '',

      // Payment and financial information
      Cust_GSTINNO: policyData.Cust_GSTINNO || '',
      IsRegGST: policyData.IsRegGST || '',
      PremiumAmount: policyData.PremiumAmount || '',
      Actual_PremiumAmount: policyData.Actual_PremiumAmount || '',

      Payment_Mode: policyData.Payment_Mode || '',
      Payment_Status: policyData.Payment_Status || '',
      Payment_Ref_No: policyData.Payment_Ref_No || '',
      Wallet_Amount: policyData.Wallet_Amount || '',
      Reliance_PremiumAmount: policyData.Reliance_PremiumAmount || '',

      // Assistance number 
      Asnumber: policyData.Asnumber || '',

      // Formatted values for display
      fullName: [policyData.FirstName, policyData.MiddleName, policyData.LastName].filter(Boolean).join(' '),
      fullAddress: [policyData.AddressLine1, policyData.AddressLine2, policyData.CityName, policyData.State, policyData.PinCode].filter(Boolean).join(', '),

      SupportEmail: 'backoffice@interstellar.co.in',
      SupportcontactNo: '+91 9967915569',

      // Formatted dates
      formattedStartDate: formatDate(policyData.PolicyStartDate),
      formattedEndDate: formatDate(policyData.PolicyEndDate),
      formattedDateOfBirth: formatDate(policyData.DateOfBirth),
      formattedCreateDate: formatDate(policyData.CreateDate),

      formattedMonth_createdate: formatnewDate(policyData.CreateDate),
      formattedCurrentDate: formatDate(today),
      currentDate: `${today.getFullYear()}.${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getDate().toString().padStart(2, '0')} ${today.getHours().toString().padStart(2, '0')}:${today.getMinutes().toString().padStart(2, '0')}:${today.getSeconds().toString().padStart(2, '0')} IST`

    };
  }

  generateQRCodeData(data) {
    return `PolicyNo:${data.Policy_No || ''} | Name:${data.fullName || ''} | Start:${data.formattedStartDate || ''} | End:${data.formattedEndDate || ''} | Premium:${data.Reliance_PremiumAmount || ''} | BusinessType:${data.BusinessType || 'New Business'} | Product:${data.Product_Code || '2832'}`;
  }
}

module.exports = new PolicyService();