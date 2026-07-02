// services/PolicyService_bajaj.js

const ejs = require('ejs');

const fs = require('fs');
const logger = require('../bin/Logger');
const puppeteer = require('puppeteer');
const db = require('../bin/dbconnection'); // This is a callback-style MySQL connection
const path = require('path');
const base64Images = require('./Base64Images');

const QRCode = require('qrcode');

class PolicyService_bajaj {

  constructor() {
    this.pdfStorePath = './public/policybajaj/';
    this.htmlStorePath = './public/htmlbajaj/';
    this.qrCodeStorePath = path.join(__dirname, '../public/qrcodes/');
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
    if (!fs.existsSync(this.pdfStorePath)) {
      fs.mkdirSync(this.pdfStorePath, { recursive: true });
    }
    if (!fs.existsSync(this.htmlStorePath)) {
      fs.mkdirSync(this.htmlStorePath, { recursive: true });
    }
    if (!fs.existsSync(this.templatesPath)) {
      fs.mkdirSync(this.templatesPath, { recursive: true });
    }
    // <-- ADD THIS BLOCK -->
    if (!fs.existsSync(this.qrCodeStorePath)) {
      fs.mkdirSync(this.qrCodeStorePath, { recursive: true });
    }
  }

  async imageToBase64(imagePath) {
    try {
      const img = await fs.promises.readFile(imagePath);
      const ext = path.extname(imagePath).toLowerCase();

      let mime = 'image/jpeg';
      if (ext === '.png') {
        mime = 'image/png';
      } else if (ext === '.svg') {
        mime = 'image/svg+xml';
      }

      return `data:${mime};base64,${img.toString('base64')}`;
    } catch (error) {
      logger.error(`Error converting image to base64 for ${imagePath}: ${error.message}`);
      return null;
    }
  }

  async generatePolicy_bajaj(policyNo, policyData, outputPath, combinepdfurl,
    callback) {
    let browser = null;
    try {

      const imgDir = path.join(__dirname, '../public/svg');
      const [wel_banner2, wel_credit, wel_footerbottom] = await Promise.all([
        this.imageToBase64(path.join(imgDir, 'wel_banner2.svg')),
        this.imageToBase64(path.join(imgDir, 'wel_credit.svg')),
        this.imageToBase64(path.join(imgDir, 'wel_footerbottom.svg'))
      ]);

   //   const PDF_BASE_URL = 'http://localhost:3000/api'; // Update to your production URL if needed
      const PDF_BASE_URL = 'http://zextratravelassist.interstellar.co.in/travel-api/api';

      const pdfFileName = path.basename(outputPath);
      const expectedPdfPath = `/welcome-letters-bajaj/${pdfFileName}`;

      const encodedFilePath = Buffer.from(combinepdfurl).toString('base64');
      const downloadUrl = `${PDF_BASE_URL}/downloadFileOpen?filePath=${encodeURIComponent(encodedFilePath)}`;

      // const downloadQrPath = path.join(this.qrCodeStorePath, `${policyNo}-welcome-download.png`);
      // await QRCode.toFile(downloadQrPath, downloadUrl, { errorCorrectionLevel: 'H', width: 180 });
      // const downloadUrlQrCodeBase64 = await this.imageToBase64(downloadQrPath);
      const downloadQrPath = path.join(this.qrCodeStorePath, `${policyNo}-welcome-download.png`);
      
      // UPDATED: Changed width to 300 for high-res, and added margin: 1
      await QRCode.toFile(downloadQrPath, downloadUrl, { 
          errorCorrectionLevel: 'M', 
          width: 400, 
          margin: 0 
      });
      
      const downloadUrlQrCodeBase64 = await this.imageToBase64(downloadQrPath);

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


      processed.wel_banner2Base64 = wel_banner2;
      processed.wel_creditBase64 = wel_credit;
      processed.wel_footerbottomBase64 = wel_footerbottom;
      processed.downloadUrlQrCodeBase64 = downloadUrlQrCodeBase64;

      // Remove existing file to avoid lock issues
      if (fs.existsSync(outputPath)) {
        try {
          fs.unlinkSync(outputPath);
          logger.info(`Removed existing PDF file at ${outputPath}`);
        } catch (err) {
          logger.warn(`Could not remove existing PDF file: ${err.message}`);
        }
      }


      const templatePath = path.join(this.templatesPath, 'welcome-letter-bajaj.ejs');
      const renderedHtml = await ejs.renderFile(templatePath, { policy: processed });

      await fs.promises.writeFile(htmlPath, renderedHtml);

      browser = await puppeteer.launch({
        headless: "new",
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
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
      });

      await browser.close();
      browser = null;

      callback(null, {
        pdfPath: outputPath,
        htmlPath: htmlPath,
        qrCodePath: downloadQrPath,
        htmlContent: renderedHtml,
        processedData: processed
      });

    } catch (error) {
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          logger.error(`Error closing browser: ${e.message}`);
        }
      }
      logger.error('Error generating policy:', error);
      if (typeof callback === 'function') {
        callback(error, null);
      }
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

      BajajgivenpolicyUrl: policyData.BajajgivenpolicyUrl || '',

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
      currentDate: `${today.getFullYear()}.${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getDate().toString().padStart(2, '0')} ${today.getHours().toString().padStart(2, '0')}:${today.getMinutes().toString().padStart(2, '0')}:${today.getSeconds().toString().padStart(2, '0')} IST`,

       assistLink: `http://zextratravelassist.interstellar.co.in/travel-api/travel-euro/travel-euro-bajaj.html?policyNo=${policyData.Policy_No}`
    };
  }


}


module.exports = new PolicyService_bajaj();