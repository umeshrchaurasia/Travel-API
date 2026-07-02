const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const logger = require('../bin/Logger');
const puppeteer = require('puppeteer');
const db = require('../bin/dbconnection');
const QRCode = require('qrcode');

class WelcomeLetterBajajService {
  constructor() {
    this.pdfStorePath = path.join(__dirname, '../public/welcome-letters-bajaj/');
    this.templatesPath = path.join(__dirname, '../views/templates');
    this.qrCodeStorePath = path.join(__dirname, '../public/qrcodes/');
    this.templateFile = 'welcome-letter-bajaj.ejs';

    this.viewportConfig = {
      width: 794,
      height: 1123,
      deviceScaleFactor: 2,
      isLandscape: false
    };

    this.ensureDirectories();
  }

  ensureDirectories() {
    try {
      if (!fs.existsSync(this.pdfStorePath)) {
        fs.mkdirSync(this.pdfStorePath, { recursive: true });
        logger.info(`Created welcome letters directory: ${this.pdfStorePath}`);
      }

      if (!fs.existsSync(this.templatesPath)) {
        fs.mkdirSync(this.templatesPath, { recursive: true });
        logger.info(`Created templates directory: ${this.templatesPath}`);
      }

      // <-- ADD THIS BLOCK FOR QR CODES
      if (!fs.existsSync(this.qrCodeStorePath)) {
        fs.mkdirSync(this.qrCodeStorePath, { recursive: true });
        logger.info(`Created qrcodes directory: ${this.qrCodeStorePath}`);
      }

      const destTemplate = path.join(this.templatesPath, this.templateFile);
      const sourceTemplate = path.join(__dirname, '../views', this.templateFile);

      if (!fs.existsSync(destTemplate) && fs.existsSync(sourceTemplate)) {
        fs.copyFileSync(sourceTemplate, destTemplate);
        logger.info(`Copied welcome letter template to templates directory`);
      } else if (!fs.existsSync(destTemplate) && !fs.existsSync(sourceTemplate)) {
        this.createDefaultTemplate(destTemplate);
      }
    } catch (error) {
      logger.error('Error ensuring directories exist:', error);
    }
  }

  createDefaultTemplate(templatePath) {
    try {
      fs.writeFileSync(
        templatePath,
        fs.readFileSync(path.join(__dirname, '../views/welcome-letter-bajaj.ejs'), 'utf8')
      );
      logger.info(`Created default welcome letter template at ${templatePath}`);
    } catch (error) {
      logger.error(`Error creating default template: ${error.message}`);
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

  /**
   * Generate welcome letter PDF from data.
   * 
   * BUG FIXES:
   * 1. `customerId` was used but never defined — replaced with `policynumber` throughout.
   * 2. `pdfUrl` was computed incorrectly using `outputPath.replace(this.pdfStorePath, ...)`,
   *    which produces an OS-path-dependent result. Now uses path.basename for reliability.
   *
   * @param {string} policynumber - Policy number (used as unique ID)
   * @param {Object} letterData - Data for the welcome letter
   * @param {string} outputPath - Full path where the PDF should be saved
   * @returns {Promise<Object>} - Result object with paths and customer info
   */
async generateWelcomeLetterBajajPdf(policynumber, letterData, outputPath) {
    let browser = null;

    try {
      logger.info(`Starting welcome letter PDF generation for policy ${policynumber}`);

      // Fetch base64 images for the template
      const imgDir = path.join(__dirname, '../public/svg');
      const [wel_banner2, wel_credit, wel_footerbottom] = await Promise.all([
        this.imageToBase64(path.join(imgDir, 'wel_banner2.svg')),
        this.imageToBase64(path.join(imgDir, 'wel_credit.svg')),
        this.imageToBase64(path.join(imgDir, 'wel_footerbottom.svg'))
      ]);

      // --- NEW QR CODE GENERATION LOGIC ---
   //   const PDF_BASE_URL = 'http://localhost:3000/api'; // Update to your production URL if needed
      const PDF_BASE_URL = 'http://zextratravelassist.interstellar.co.in/travel-api/api';

      const pdfFileName = path.basename(outputPath);
      const expectedPdfPath = `/welcome-letters-bajaj/${pdfFileName}`;

      const encodedFilePath = Buffer.from(expectedPdfPath).toString('base64');
      const downloadUrl = `${PDF_BASE_URL}/downloadFileOpen?filePath=${encodeURIComponent(encodedFilePath)}`;

      const downloadQrPath = path.join(this.qrCodeStorePath, `${policynumber}-welcome-download.png`);
      await QRCode.toFile(downloadQrPath, downloadUrl, { errorCorrectionLevel: 'M', width: 400, margin: 0 });
      const downloadUrlQrCodeBase64 = await this.imageToBase64(downloadQrPath);

      // Inject base64 images into the policy data object
      if (letterData.policy) {
        letterData.policy.wel_banner2Base64 = wel_banner2;
        letterData.policy.wel_creditBase64 = wel_credit;
        letterData.policy.wel_footerbottomBase64 = wel_footerbottom;
        letterData.policy.downloadUrlQrCodeBase64 = downloadUrlQrCodeBase64;

        // ADDED: Dynamic assist link for the button
        letterData.policy.assistLink = `http://zextratravelassist.interstellar.co.in/travel-api/travel-euro/travel-euro-bajaj.html?policyNo=${policynumber}`;
      }

      // Remove existing file to avoid lock issues
      if (fs.existsSync(outputPath)) {
        try {
          fs.unlinkSync(outputPath);
          logger.info(`Removed existing PDF file at ${outputPath}`);
        } catch (err) {
          logger.warn(`Could not remove existing PDF file: ${err.message}`);
        }
      }

      const templatePath = path.join(this.templatesPath, this.templateFile);
      if (!fs.existsSync(templatePath)) {
        logger.error(`Template file not found: ${templatePath}`);
        throw new Error(`Template file not found: ${templatePath}`);
      }

      logger.info(`Rendering EJS template for customer: ${letterData.customerName}`);

      const renderedHtml = await this.renderEjsTemplate(templatePath, letterData);
   //   const enhancedHtml = this.enhanceHtmlForPdf(renderedHtml);

      // --- PUPPETEER LOGIC SOURCED FROM POLICYSERVICE.JS ---
      browser = await puppeteer.launch({
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
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
      });

      await browser.close();
      browser = null; // Clear browser reference so catch block doesn't try to close it again

      logger.info(`PDF generated at ${outputPath}`);

      const pdfUrl = expectedPdfPath;

      return {
        pdfPath: outputPath,
        pdfUrl,
        policynumber: policynumber,
        customerName: letterData.customerName
      };

    } catch (error) {
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          logger.error(`Error closing browser: ${e.message}`);
        }
      }

      logger.error(`Error generating welcome letter PDF for ${policynumber}:`, error);
      throw error;
    }
  }

  renderEjsTemplate(templatePath, data) {
    return new Promise((resolve, reject) => {
      ejs.renderFile(templatePath, data, (err, html) => {
        if (err) {
          logger.error(`Error rendering template: ${err.message}`);
          reject(err);
        } else {
          resolve(html);
        }
      });
    });
  }

  enhanceHtmlForPdf(html) {
    try {
      const enhancedStyles = `
        <style>
          @page {
            size: A4;
            margin: 10mm;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            padding: 0;
            font-size: 12px;
            line-height: 1.4;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          table th, table td {
            padding: 8px;
            border: 1px solid #ddd;
          }
          table th {
            background-color: #f2f2f2;
            font-weight: bold;
            text-align: left;
          }
          .letter-title {
            text-align: center;
            font-weight: bold;
            margin-bottom: 20px;
          }
          .signature {
            margin-top: 30px;
          }
          .disclaimer {
            font-size: 8px;
            margin-top: 20px;
          }
        </style>
      `;

      return html.replace('</head>', `${enhancedStyles}</head>`);
    } catch (error) {
      logger.error('Error enhancing HTML for PDF:', error);
      return html;
    }
  }

  async generatePdf(html, outputPath) {
    let browser = null;

    const timeout = setTimeout(() => {
      logger.error('PDF generation timed out');
      if (browser) {
        browser.close().catch(err => logger.error('Error closing browser after timeout:', err));
      }
    }, 30000);

    try {
      browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--single-process'
        ],
        timeout: 20000
      });

      logger.info('Browser launched successfully');
      const page = await browser.newPage();
      await page.setViewport(this.viewportConfig);

      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: 15000
      });

      await page.evaluate(() => {
        document.body.style.margin = '0';
        document.body.style.padding = '20px';
        document.body.style.fontFamily = 'Arial, Helvetica, sans-serif';
      });

      await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        timeout: 15000
      });

      clearTimeout(timeout);
      await browser.close();
      browser = null;
      logger.info('Browser closed successfully');

      return outputPath;
    } catch (error) {
      clearTimeout(timeout);

      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          logger.error(`Error closing browser: ${e.message}`);
        }
        browser = null;
      }

      logger.error(`Error generating PDF: ${error.message}`);
      throw error;
    }
  }

  async getWelcomeLetterByCustomerId(policynumber) {
    try {
      const pdfPath = path.join(this.pdfStorePath, `WelcomeLetter_${policynumber}.pdf`);

      if (!fs.existsSync(pdfPath)) {
        logger.error(`PDF not found for policy: ${policynumber}`);
        return null;
      }

      return {
        pdfPath,
        pdfUrl: `/welcome-letters-bajaj/WelcomeLetter_${policynumber}.pdf`,
        policynumber
      };
    } catch (error) {
      logger.error(`Error getting welcome letter for ${policynumber}:`, error);
      throw error;
    }
  }
}

module.exports = new WelcomeLetterBajajService();