const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const logger = require('../bin/Logger');
const puppeteer = require('puppeteer');
const db = require('../bin/dbconnection'); // This is a callback-style MySQL connection

class WelcomeLetterService {
  constructor() {
    this.pdfStorePath = path.join(__dirname, '../public/welcome-letters/');
    this.templatesPath = path.join(__dirname, '../views/templates');
    this.templateFile = 'welcome-letter.ejs';

    // Set consistent viewport dimensions for letter
    this.viewportConfig = {
      width: 794, // A4 width in pixels at 96 DPI
      height: 1123, // A4 height in pixels at 96 DPI
      deviceScaleFactor: 2, // Higher resolution for better quality
      isLandscape: false
    };

    // Ensure directories exist at startup
    this.ensureDirectories();
  }

  /**
   * Ensure all required directories exist
   */
  ensureDirectories() {
    try {
      // Create welcome letters directory if it doesn't exist
      if (!fs.existsSync(this.pdfStorePath)) {
        fs.mkdirSync(this.pdfStorePath, { recursive: true });
        logger.info(`Created welcome letters directory: ${this.pdfStorePath}`);
      }

      // Create templates directory if it doesn't exist
      if (!fs.existsSync(this.templatesPath)) {
        fs.mkdirSync(this.templatesPath, { recursive: true });
        logger.info(`Created templates directory: ${this.templatesPath}`);
      }

      // Check for the template file
      const destTemplate = path.join(this.templatesPath, this.templateFile);
      const sourceTemplate = path.join(__dirname, '../views', this.templateFile);
      
      if (!fs.existsSync(destTemplate) && fs.existsSync(sourceTemplate)) {
        fs.copyFileSync(sourceTemplate, destTemplate);
        logger.info(`Copied welcome letter template to templates directory`);
      } else if (!fs.existsSync(destTemplate) && !fs.existsSync(sourceTemplate)) {
        // Create template if it doesn't exist anywhere
        this.createDefaultTemplate(destTemplate);
      }
    } catch (error) {
      logger.error('Error ensuring directories exist:', error);
    }
  }

  /**
   * Create a default welcome letter template if none exists
   * @param {string} templatePath - Path to create the template
   */
  createDefaultTemplate(templatePath) {
    try {
      // Read from the provided template in your codebase
      fs.writeFileSync(templatePath, fs.readFileSync(path.join(__dirname, '../views/welcome-letter.ejs'), 'utf8'));
      logger.info(`Created default welcome letter template at ${templatePath}`);
    } catch (error) {
      logger.error(`Error creating default template: ${error.message}`);
    }
  }

  /**
   * Generate welcome letter PDF from data
   * This is the simplified version for the new 2-step process
   * @param {string} customerId - Unique customer ID
   * @param {Object} letterData - Data for the welcome letter
   * @param {string} outputPath - Path where to save the PDF
   * @returns {Promise<Object>} - Result object with paths
   */
  async generateWelcomeLetterPdf(customerId, letterData, outputPath) {
    let browser = null;

    try {
      logger.info(`Starting welcome letter PDF generation for customer ${customerId}`);
      
      // Delete existing PDF if it exists to avoid file lock issues
      if (fs.existsSync(outputPath)) {
        try {
          fs.unlinkSync(outputPath);
          logger.info(`Removed existing PDF file at ${outputPath}`);
        } catch (err) {
          logger.warn(`Could not remove existing PDF file: ${err.message}`);
        }
      }

      // Check if template exists
      const templatePath = path.join(this.templatesPath, this.templateFile);
      if (!fs.existsSync(templatePath)) {
        logger.error(`Template file not found: ${templatePath}`);
        throw new Error(`Template file not found: ${templatePath}`);
      }

      logger.info(`Rendering EJS template for welcome letter for customer: ${letterData.customerName}`);

      // Render EJS template
      const renderedHtml = await this.renderEjsTemplate(templatePath, letterData);
      
      // Enhance HTML with better styling for PDF
      const enhancedHtml = this.enhanceHtmlForPdf(renderedHtml);

      // Generate PDF
      await this.generatePdf(enhancedHtml, outputPath);

      logger.info(`PDF generated at ${outputPath}`);
      
      const pdfUrl = outputPath.replace(this.pdfStorePath, '/welcome-letters/');
      
      return {
        pdfPath: outputPath,
        pdfUrl,
        customerId,
        customerName: letterData.customerName
      };
    } catch (error) {
      // Close browser if there's an error
      if (browser) {
        try {
          await browser.close();
        } catch (e) { 
          logger.error(`Error closing browser: ${e.message}`);
        }
      }

      logger.error(`Error in generate welcome letter PDF for ${customerId}:`, error);
      throw error;
    }
  }

  /**
   * Render EJS template with data
   * @param {string} templatePath - Path to the EJS template
   * @param {Object} data - Data to render in the template
   * @returns {Promise<string>} - Rendered HTML
   */
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

  /**
   * Enhance HTML for better PDF generation
   * @param {string} html - Original HTML content
   * @returns {string} - Enhanced HTML for PDF generation
   */
  enhanceHtmlForPdf(html) {
    try {
      // Add styling for better PDF display
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

      // Add the enhanced styles to the head section
      let enhancedHtml = html.replace('</head>', `${enhancedStyles}</head>`);

      return enhancedHtml;
    } catch (error) {
      logger.error('Error enhancing HTML for PDF:', error);
      return html;
    }
  }

  /**
   * Generate PDF from HTML using Puppeteer with timeout protection
   * @param {string} html - HTML content
   * @param {string} outputPath - Output file path
   * @returns {Promise<void>}
   */
  async generatePdf(html, outputPath) {
    let browser = null;
    
    // Set a timeout for Puppeteer operations
    const timeout = setTimeout(() => {
      logger.error('PDF generation took too long, aborting');
      if (browser) {
        browser.close().catch(err => logger.error('Error closing browser after timeout:', err));
      }
    }, 30000); // 30 second timeout
    
    try {
      // Launch Puppeteer browser with optimized settings
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
        timeout: 20000 // 20 second timeout for browser launch
      });

      logger.info('Browser launched successfully');
      const page = await browser.newPage();
      logger.info('New page created');

      // Set consistent viewport for the welcome letter
      await page.setViewport(this.viewportConfig);
      logger.info('Viewport set');

      // Set content with optimized options
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: 15000
      });
      logger.info('Content set');

      // Apply browser-side styling and alignment fixes
      await page.evaluate(() => {
        // Basic styling
        document.body.style.margin = '0';
        document.body.style.padding = '20px';
        document.body.style.fontFamily = 'Arial, Helvetica, sans-serif';
      });
      logger.info('Styling applied');

      // Generate PDF with precise settings
      await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm'
        },
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        timeout: 15000
      });
      logger.info('PDF generated');

      // Clear the timeout since we're done
      clearTimeout(timeout);

      // Close the browser
      await browser.close();
      browser = null;
      logger.info('Browser closed successfully');

      return outputPath;
    } catch (error) {
      // Clear the timeout since we're handling the error
      clearTimeout(timeout);
      
      // Close the browser if it's still open
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

  /**
   * Get welcome letter by customer ID
   * @param {string} customerId - Unique customer ID
   * @returns {Promise<Object>} - Result object with path
   */
  async getWelcomeLetterByCustomerId(customerId) {
    try {
      const pdfPath = path.join(this.pdfStorePath, `WelcomeLetter_${customerId}.pdf`);
      
      // Check if PDF exists
      if (!fs.existsSync(pdfPath)) {
        logger.error(`PDF not found for customer ID: ${customerId}`);
        return null;
      }
      
      // Return paths
      return {
        pdfPath,
        pdfUrl: `/welcome-letters/WelcomeLetter_${customerId}.pdf`,
        customerId
      };
    } catch (error) {
      logger.error(`Error getting welcome letter for ${customerId}:`, error);
      throw error;
    }
  }
}

module.exports = new WelcomeLetterService();