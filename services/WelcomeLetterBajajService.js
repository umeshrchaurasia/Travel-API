const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const logger = require('../bin/Logger');
const puppeteer = require('puppeteer');
const db = require('../bin/dbconnection');

class WelcomeLetterBajajService {
  constructor() {
    this.pdfStorePath = path.join(__dirname, '../public/welcome-letters-bajaj/');
    this.templatesPath = path.join(__dirname, '../views/templates');
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
        fs.readFileSync(path.join(__dirname, '../views/welcome-letter.ejs'), 'utf8')
      );
      logger.info(`Created default welcome letter template at ${templatePath}`);
    } catch (error) {
      logger.error(`Error creating default template: ${error.message}`);
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
      const enhancedHtml = this.enhanceHtmlForPdf(renderedHtml);

      await this.generatePdf(enhancedHtml, outputPath);

      logger.info(`PDF generated at ${outputPath}`);

      // FIX: Use path.basename so the URL is always correct regardless of OS path separators
      const pdfFileName = path.basename(outputPath);
      const pdfUrl = `/welcome-letters-bajaj/${pdfFileName}`;

      return {
        pdfPath: outputPath,
        pdfUrl,
        policynumber: policynumber,                       // FIX: was `customerId` (undefined)
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