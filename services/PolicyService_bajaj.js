// services/PolicyService_bajaj.js

const ejs = require('ejs');

const fs = require('fs');
const logger = require('../bin/Logger');
const puppeteer = require('puppeteer');
const db = require('../bin/dbconnection'); // This is a callback-style MySQL connection
const path = require('path');
const base64Images = require('./Base64Images');

class PolicyService_bajaj {

  constructor() {
    this.pdfStorePath = './public/policybajaj/';
    this.htmlStorePath = './public/htmlbajaj/';

    this.templatesPath = path.join(__dirname, '../views/templates');
    this.ensureDirectories();


    this.LogoImageBase64 = base64Images.LogoImageBase64;
    this.SignImageBase64 = base64Images.SignImageBase64;
    this.LogotravelImageBase64 = base64Images.LogotravelImageBase64;


    this.Travel_signImageBase64 = base64Images.Travel_signImageBase64;

    // You'd add scanner image base64 here too if needed
    this.ScannerImageBase64 = ""; // Add your base64 string here
  }

  ensureDirectories() {
    [this.pdfStorePath, this.htmlStorePath].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  async generatePolicy_bajaj(policyNo, policyData, callback) {
    try {
      const processed = this.preparePolicyData(policyData);
      const timestamp = Date.now();
      const pdfPath = path.join(this.pdfStorePath, `${policyNo}_${timestamp}.pdf`);
      const htmlPath = path.join(this.htmlStorePath, `${policyNo}.html`);




      // Add base64 images directly instead of file URLs

      processed.logoBase64 = this.LogoImageBase64;

      processed.signBase64 = this.SignImageBase64;

      processed.logotravelimageBase64 = this.LogotravelImageBase64;
      processed.travel_signImageBase64 = this.Travel_signImageBase64;
      processed.techtravelImageBase64 = this.techtravelImageBase64;



      const templatePath = path.join(this.templatesPath, 'welcome-letter-bajaj.ejs');
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
        qrCodePath: 'qrPath',
        htmlContent: renderedHtml,
        processedData: processed
      });

    } catch (error) {
      logger.error('Error generating policy:', error);
      callback(error, null);
    }
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


    return {
      ...policyData,
      // Basic policy information
      Policy_No: policyData.Policy_No || '',
      NameofPlan: policyData.NameofPlan || 'N/A',


      Product_Code: policyData.Product_Code || 'N/A',
      day_of_difference: policyData.day_of_difference || 'N/A',
      PlanAmount: policyData.PlanAmount || '',

      // Contact information
      LandLineNumber: policyData.LandLineNumber || '',
      CountryVisiting: policyData.CountryVisiting || '',
      EmailID: policyData.EmailID || '',
      MobileNumber: policyData.MobileNumber || '',

      // Intermediatory information

      Agent_Code: policyData.Agent_Code || '',

      SenderName: policyData.SenderName || '',

      // Personal information

      Gender: policyData.Gender || '',
      DateOfBirth: policyData.DateOfBirth || '',

      BajajgivenpolicyUrl:policyData.BajajgivenpolicyUrl || '',

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
      formattedCreateDate: formatDate(policyData.Created_Date),

      formattedMonth_createdate: formatnewDate(policyData.Created_Date),
      formattedCurrentDate: formatDate(today),
      currentDate: `${today.getFullYear()}.${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getDate().toString().padStart(2, '0')} ${today.getHours().toString().padStart(2, '0')}:${today.getMinutes().toString().padStart(2, '0')}:${today.getSeconds().toString().padStart(2, '0')} IST`

    };
  }


}


module.exports = new PolicyService_bajaj();