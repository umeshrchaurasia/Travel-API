const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const logger = require('../bin/Logger');
const puppeteer = require('puppeteer');

class InvoiceService {
    constructor() {
        this.pdfStorePath = './public/invoices/';
        this.htmlStorePath = './public/html/'; // Add HTML storage path
        this.templatesPath = path.join(__dirname, '../views/templates');

        // Set consistent viewport dimensions for invoice
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
            // Create invoices directory if it doesn't exist
            if (!fs.existsSync(this.pdfStorePath)) {
                fs.mkdirSync(this.pdfStorePath, { recursive: true });
                logger.info(`Created invoices directory: ${this.pdfStorePath}`);
            }

            // Create HTML directory if it doesn't exist
            if (!fs.existsSync(this.htmlStorePath)) {
                fs.mkdirSync(this.htmlStorePath, { recursive: true });
                logger.info(`Created HTML directory: ${this.htmlStorePath}`);
            }

            // Create templates directory if it doesn't exist
            const templatesDir = path.join(this.templatesPath);
            if (!fs.existsSync(templatesDir)) {
                fs.mkdirSync(templatesDir, { recursive: true });
                logger.info(`Created templates directory: ${templatesDir}`);
            }

            // Make sure the tax-invoice-inter.ejs template is in the templates directory
            const sourceTemplate = path.join(__dirname, '../views/tax-invoice-inter.ejs');
            const destTemplate = path.join(this.templatesPath, 'tax-invoice-inter.ejs');

            if (fs.existsSync(sourceTemplate) && !fs.existsSync(destTemplate)) {
                fs.copyFileSync(sourceTemplate, destTemplate);
                logger.info(`Copied invoice template to templates directory`);
            }

            // Make sure the tax-invoice-inter_upfront.ejs template is in the templates directory
            const sourceUpfrontTemplate = path.join(__dirname, '../views/tax-invoice-inter_upfront.ejs');
            const destUpfrontTemplate = path.join(this.templatesPath, 'tax-invoice-inter_upfront.ejs');

            if (fs.existsSync(sourceUpfrontTemplate) && !fs.existsSync(destUpfrontTemplate)) {
                fs.copyFileSync(sourceUpfrontTemplate, destUpfrontTemplate);
                logger.info(`Copied upfront invoice template to templates directory`);
            }

        } catch (error) {
            logger.error('Error ensuring directories exist:', error);
        }
    }

    /**
     * Save HTML content to file
     * @param {string} htmlContent - The HTML content to save
     * @param {string} custId - Customer ID for filename
     * @returns {Object} - Object containing HTML file path and URL
     */
    saveHtmlFile(htmlContent, custId) {
        try {
            const htmlFileName = `Invoice${custId}.html`;
            const htmlFilePath = path.join(this.htmlStorePath, htmlFileName);
            const htmlUrl = `/html/${htmlFileName}`;

            // Delete existing HTML file if it exists
            if (fs.existsSync(htmlFilePath)) {
                try {
                    fs.unlinkSync(htmlFilePath);
                    logger.info(`Removed existing HTML file at ${htmlFilePath}`);
                } catch (err) {
                    logger.warn(`Could not remove existing HTML file: ${err.message}`);
                }
            }

            // Write HTML content to file
            fs.writeFileSync(htmlFilePath, htmlContent, 'utf8');
            logger.info(`HTML file saved at ${htmlFilePath}`);

            return {
                htmlPath: htmlFilePath,
                htmlUrl: htmlUrl
            };
        } catch (error) {
            logger.error('Error saving HTML file:', error);
            throw error;
        }
    }

    /**
     * Update the header template with proper alignment and base64 logo
     * @param {string} html - Original HTML
     * @param {string} policyLogoBase64 - Base64 encoded policy logo
     * @returns {string} - Modified HTML with fixed header
     */
    fixHeaderTemplate(html, policyLogoBase64) {
        try {
            // Find the header section and update its structure
            const headerPattern = /<table border="0" cellpadding="0" cellspacing="0" width="100%" >([\s\S]*?)<\/table>/;

            // Use base64 encoded logo instead of URL
            const logoImgTag = policyLogoBase64
                ? `<img src="${policyLogoBase64}" style="max-width:200px; max-height:70px;">`
                : `<img src="http://mfmapi.policyboss.com/invoice/policylogo.png" style="max-width:200px; max-height:70px;">`;

            const headerReplacement = `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:10px;">
                <tr>
                    <td style="padding:3px 5px; text-align:left; width:50%; vertical-align:top;">
                        ${logoImgTag}
                    </td>
                    <td style="font-size:8px; font-family:Arial, Helvetica, sans-serif; text-align:right; vertical-align:top;">
                        <strong>Regd. Office</strong><br>
                        187/22,4th Floor(above ICICI Bank ATM),<br> 
                        Venkatesh Meher,Ghole Road,Shivaji Nagar,<br>
                        Pune (Maharashtra)-411005.<br>
                        PAN : AAHCS3947E<br>
                        GSTIN : 27AAHCS3947E1Z7
                    </td>
                </tr>
                <tr>
                    <td style="font-size:10px; font-family:Arial, Helvetica, sans-serif; padding-top:5px;">
                        <strong>Landmark Insurance Brokers Pvt. Ltd.</strong><br>
                        CIN U66030PN2002PTC017009 | www.policyboss.com | 1800-419-419-9<br>
                        IRDAI CoR No: 216 |Category: Direct (Life & General)
                    </td>
                    <td></td>
                </tr>
            </table>`;

            // Replace the header section
            let updatedHtml = html.replace(headerPattern, headerReplacement);

            return updatedHtml;
        } catch (error) {
            logger.error('Error fixing header template:', error);
            return html;
        }
    }

    /**
     * Add signature base64 image to the HTML
     * @param {string} html - Original HTML
     * @param {string} signatureBase64 - Base64 encoded signature
     * @returns {string} - Modified HTML with signature image
     */
    addSignatureToHtml(html, signatureBase64) {
        try {
            if (!signatureBase64) {
                return html; // Return original if no signature provided
            }

            // Find the signature section in the HTML
            const signaturePattern = /<img\s+[^>]*?src=["'][^"']*?signature\.png["'][^>]*?>/i;

            // Create the new signature image tag with the base64 data
            const signatureTag = `<img src="${signatureBase64}" style="max-width:200px; max-height:100px;">`;

            // Replace the signature image in the HTML
            let updatedHtml = html;
            if (signaturePattern.test(html)) {
                updatedHtml = html.replace(signaturePattern, signatureTag);
            } else {
                // If no signature tag found, try to find authorised signatory text and add image before it
                const authSignatoryPattern = /authorised\s+signatory/i;
                if (authSignatoryPattern.test(html)) {
                    updatedHtml = html.replace(/(authorised\s+signatory)/i, `${signatureTag}<br>$1`);
                }
            }

            return updatedHtml;
        } catch (error) {
            logger.error('Error adding signature to HTML:', error);
            return html;
        }
    }

    /**
     * Generate both PDF and HTML for an invoice
     * @param {string} custId - Customer ID
     * @param {Object} invoiceData - Invoice data
     * @param {string} policyLogoBase64 - Base64 encoded policy logo (optional)
     * @param {string} signatureBase64 - Base64 encoded signature (optional)
     * @param {Function} callback - Callback function
     */

    async generateInvoice(custId, invoiceData, policyLogoBase64, signatureBase64, callback) {
        if (typeof policyLogoBase64 === 'function') {
            callback = policyLogoBase64;
            policyLogoBase64 = null;
            signatureBase64 = null;
        } else if (typeof signatureBase64 === 'function') {
            callback = signatureBase64;
            signatureBase64 = null;
        }

        let browser = null;
        try {
            const processed = this.prepareInvoiceData(invoiceData);
            const pdfPath = path.join(this.pdfStorePath, `Invoice${custId}.pdf`);
            const pdfUrl = `/invoices/Invoice${custId}.pdf`;

            if (fs.existsSync(pdfPath)) {
                fs.unlinkSync(pdfPath);
            }

            const templateFileName = processed.Paymentmode === 'Upfront Commission'
                ? 'tax-invoice-inter_upfront.ejs'
                : 'tax-invoice-inter.ejs';

            const templatePath = path.join(this.templatesPath, templateFileName);

            if (!fs.existsSync(templatePath)) {
                const errorMsg = `Template file not found: ${templatePath}`;
                logger.error(errorMsg);
                return callback(new Error(errorMsg), null);
            }

            ejs.renderFile(templatePath, { students: processed, policyLogoBase64, signatureBase64 }, async (err, renderedHtml) => {
                if (err) {
                    return callback(err, null);
                }

                const enhancedHtml = this.enhanceHtmlForPdf(renderedHtml);

                try {
                    browser = await puppeteer.launch({
                        headless: true,
                        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                    });

                    const page = await browser.newPage();
                    await page.setViewport(this.viewportConfig);
                    await page.setContent(enhancedHtml, { waitUntil: 'networkidle0' });

                    await page.pdf({
                        path: pdfPath,
                        format: 'A4',
                        printBackground: true,
                        margin: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' },
                    });

                    await browser.close();
                    return callback(null, { pdfPath, pdfUrl, processedData: processed });

                } catch (pdfErr) {
                    if (browser) await browser.close();
                    return callback(pdfErr, null);
                }
            });
        } catch (error) {
            if (browser) await browser.close();
            callback(error, null);
        }
    }



    /**
     * Generate only HTML file (without PDF)
     * @param {string} custId - Customer ID
     * @param {Object} invoiceData - Invoice data
     * @param {string} policyLogoBase64 - Base64 encoded policy logo (optional)
     * @param {string} signatureBase64 - Base64 encoded signature (optional)
     * @param {Function} callback - Callback function
     */
    generateHtmlOnly(custId, invoiceData, policyLogoBase64, signatureBase64, callback) {
        // Handle backward compatibility
        if (typeof policyLogoBase64 === 'function') {
            callback = policyLogoBase64;
            policyLogoBase64 = null;
            signatureBase64 = null;
        } else if (typeof signatureBase64 === 'function') {
            callback = signatureBase64;
            signatureBase64 = null;
        }

        try {
            logger.info(`Starting HTML generation for customer ${custId}`);

            // Process the invoice data for the template
            const processed = this.prepareInvoiceData(invoiceData);

            // Determine which template to use based on Paymentmode
            let templateFileName = 'tax-invoice-inter.ejs'; // Default template
            if (processed.Paymentmode === 'Upfront Commission') {
                templateFileName = 'tax-invoice-inter_upfront.ejs';
            }

            const templatePath = path.join(this.templatesPath, templateFileName);

            if (!fs.existsSync(templatePath)) {
                logger.error(`Template file not found: ${templatePath}`);
                return callback(new Error(`Template file not found: ${templatePath}`), null);
            }

            logger.info(`Rendering EJS template '${templateFileName}' for invoice ${processed.InvNo}`);

            // Render EJS template
            ejs.renderFile(
                templatePath,
                {
                    students: processed,
                    policyLogoBase64: policyLogoBase64,
                    signatureBase64: signatureBase64
                },
                (err, renderedHtml) => {
                    if (err) {
                        logger.error(`Error rendering template for invoice ${processed.InvNo}:`, err);
                        return callback(err, null);
                    }

                    // Fix header template with the policy logo
                    let fixedHtml = this.fixHeaderTemplate(renderedHtml, policyLogoBase64);

                    // Enhance HTML with better styling

                    let enhancedHtml = this.enhanceHtmlForPdf(fixedHtml);

                    // Save HTML file
                    try {
                        const htmlFileInfo = this.saveHtmlFile(enhancedHtml, custId);
                        logger.info(`HTML file generated successfully: ${htmlFileInfo.htmlPath}`);

                        return callback(null, {
                            htmlPath: htmlFileInfo.htmlPath,
                            htmlUrl: htmlFileInfo.htmlUrl,
                            processedData: processed
                        });
                    } catch (htmlError) {
                        logger.error(`Error saving HTML file: ${htmlError.message}`);
                        return callback(htmlError, null);
                    }
                }
            );
        } catch (error) {
            logger.error(`Error in generate HTML for ${custId}:`, error);
            callback(error, null);
        }
    }

    /**
     * Enhance HTML for better PDF generation
     * @param {string} html - Original HTML content
     * @returns {string} - Enhanced HTML for PDF generation
     */

    enhanceHtmlForPdf(html) {
        const styles = `
            <style>
                body { 
                    font-family: Arial, Helvetica, sans-serif; 
                    margin: 0; 
                    padding: 0; 
                    font-size: 10px; 
                    color: #000; 
                }
                .invoice-wrapper {
                    padding: 20px;
                }
                .invoice-header {
                    text-align: center;
                    font-size: 20px;
                    padding-bottom: 10px;
                }
                table { 
                    border-collapse: collapse; 
                    width: 100%; 
                    border-spacing: 0;
                }
                td, th { 
                    padding: 8px;
                    vertical-align: top; 
                    font-size: 10px; 
                    word-wrap: break-word;
                }
                p { margin: 2px 0; }

                /* Main Box Structure */
                .invoice-main-box {
                    border: 1px solid #000;
                }
                .invoice-main-box > div {
                    border-top: 1px solid #000;
                }
                .invoice-main-box > div:first-child {
                    border-top: none;
                }

                /* Top Section using Flexbox */
                .top-section {
                    display: flex;
                }
                .agent-details {
                    width: 60%;
                    padding: 8px;
                    border-right: 1px solid #000;
                }
                .invoice-details {
                    width: 60%;
                   
                }
              
                .invoice-no {
                    border-bottom: 1px solid #000;
                }

                /* To Address */
                .to-address {
                    padding: 8px;
                }

                /* Particulars Table */
                .particulars-section { padding: 0; }
                .particulars-table { table-layout: fixed; }
                .particulars-table thead th { border-bottom: 1px solid #000; }
                
                .particulars-table th:not(:last-child),
                .particulars-table td:not(:last-child) {
                    border-right: 1px solid #000;
                }
                .particulars-table .col-sr-no { width: 8%; }
                .particulars-table .col-particulars { width: 52%; }
                .particulars-table .col-hsn { width: 20%; }
                .particulars-table .col-amount { width: 20%; }
                
                .particulars-table tbody tr:not(:first-child) {
                    border-top: 1px solid #000;
                }
                
                /* Amount/Words and Signature */
                .amount-words { padding: 8px; }
                .declaration-signature {
                    display: flex;
                    vertical-align: bottom;
                }
                .declaration-text { width: 70%; padding: 8px; }
                .signature-area { width: 30%; text-align: right; padding: 8px; }

                /* Footer */
                .footer-declaration {
                    text-align: center;
                    padding-top: 0px;
                    font-size: 12px;
                }
                .footer-declaration p { margin: 5px 0; }
            </style>
        `;

        const bodyContentMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        if (!bodyContentMatch) return html;
        const bodyContent = bodyContentMatch[1];

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Tax Invoice</title>
                ${styles}
            </head>
            <body>
                ${bodyContent}
            </body>
            </html>
        `;
    }
    /**
     * Generate a simple PDF as fallback
     * @param {string} html - HTML content
     * @param {string} outputPath - Output file path
     * @returns {Promise<void>}
     */
    async generateSimplePdf(html, outputPath) {
        try {
            // Create a new browser instance with minimal settings
            const browser = await puppeteer.launch({
                headless: true, // Use true instead of 'new'
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
                ignoreDefaultArgs: ['--enable-automation'],
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

            // Create a new page with simplified settings
            const page = await browser.newPage();

            // Add essential styles to force proper layout
            let enhancedHtml = this.enhanceHtmlForPdf(html);

            // Set content with minimal wait
            await page.setContent(enhancedHtml, { waitUntil: 'domcontentloaded' });

            // Set viewport to A4 size
            await page.setViewport({
                width: 794,
                height: 1123,
                deviceScaleFactor: 2
            });

            // Generate PDF with proper settings
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
                preferCSSPageSize: true
            });

            await browser.close();
        } catch (error) {
            logger.error('Simple PDF fallback failed:', error);
            throw error;
        }
    }

    /**
     * Generate a sample invoice for testing
     * @param {string} policyLogoBase64 - Base64 encoded policy logo (optional)
     * @param {string} signatureBase64 - Base64 encoded signature (optional)
     * @param {Function} callback - Callback function
     */
    generateSampleInvoice(policyLogoBase64, signatureBase64, callback) {
        // Handle backward compatibility
        if (typeof policyLogoBase64 === 'function') {
            callback = policyLogoBase64;
            policyLogoBase64 = null;
            signatureBase64 = null;
        } else if (typeof signatureBase64 === 'function') {
            callback = signatureBase64;
            signatureBase64 = null;
        }

        logger.info('Generating sample invoice for testing');

        const sampleData = {
            name: "Rajesh Kumar",
            statecode: "MH",
            Address: "Bandra (East)",
            PAN: "AIFGC9224P",
            Date: "24-04-2023",
            InvNo: "TF202021000003",
            CustId: "423124",
            GST: "",
            Rate: "850",
            totalamount: "1003",
            Wordsamount: "One Thousand Three Rupees Only"
        };

        this.generateInvoice(sampleData.CustId, sampleData, policyLogoBase64, signatureBase64, callback);
    }

    /**
     * Prepare invoice data with necessary calculations
     * @param {Object} invoiceData - Raw invoice data
     * @returns {Object} - Processed invoice data with tax calculations
     */

    numberToWords(num) {
        if (num === null || isNaN(num)) {
            return '';
        }

        const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
        const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        const inWords = (n) => {
            let str = '';
            if (n > 19) {
                str += b[Math.floor(n / 10)] + a[n % 10];
            } else {
                str += a[n];
            }
            return str.trim();
        };

        let number = Math.round(num * 100) / 100;
        let rupees = Math.floor(number);
        let paise = Math.round((number - rupees) * 100);

        if (rupees === 0 && paise === 0) {
            return 'Zero Rupees Only';
        }

        let output = '';
        if (rupees > 0) {
            output += inWords(Math.floor(rupees / 10000000)) !== '' ? inWords(Math.floor(rupees / 10000000)) + ' Crore ' : '';
            rupees %= 10000000;
            output += inWords(Math.floor(rupees / 100000)) !== '' ? inWords(Math.floor(rupees / 100000)) + ' Lakh ' : '';
            rupees %= 100000;
            output += inWords(Math.floor(rupees / 1000)) !== '' ? inWords(Math.floor(rupees / 1000)) + ' Thousand ' : '';
            rupees %= 1000;
            output += inWords(Math.floor(rupees / 100)) !== '' ? inWords(Math.floor(rupees / 100)) + ' Hundred ' : '';
            rupees %= 100;
            if (output !== '' && rupees > 0) {
                output += 'and ';
            }
            output += inWords(rupees);
        }

        let result = output.trim() + ' Rupees';

        if (paise > 0) {
            result += ' and ' + inWords(paise) + ' Paise';
        }

        return result.replace(/\s\s+/g, ' ').trim() + ' Only';
    }

    prepareInvoiceData(invoiceData) {
        let CGST = "-";
        let SGST = "-";
        let IGST = "-";

        let lessCommission = 0; 
        let lessCommissionWords_Upfront = "";// Initialize commission
        let tdsAmount = 0;      // Initialize TDS

        let finalTotalAmount_Upfront = 0;
        let finalWordsAmount_Upfront = "";


        let Actual_PremiumAmount_Upfront = parseFloat(invoiceData.Actual_PremiumAmount || 0);;
        let subTotalAmount_Upfront = 0;
        subTotalAmount_Upfront = Math.round(parseFloat(invoiceData.Actual_PremiumAmount || 0) / 1.18);
      
        // Get the base amount (Rate) to calculate tax
        const baseAmount = parseFloat(invoiceData.Rate || 0);

        const payoutPercentage = parseFloat(invoiceData.Payout || 0);
        const state = (invoiceData.statecode || '').toUpperCase();

        // Keep original total amount unless it's recalculated
        let finalTotalAmount = parseFloat(invoiceData.totalamount || 0);
        let finalWordsAmount = invoiceData.Wordsamount || '';

        let finalpayout_commisionAmount = 0;

        let numCgst = 0;
        let numSgst = 0;
        let numIgst = 0;

        if (invoiceData.Paymentmode === 'Upfront Commission') {
            if (state === "GJ" || state === "GUJARAT") {
                numCgst = Math.round(subTotalAmount_Upfront * 0.09);
                numSgst = Math.round(subTotalAmount_Upfront * 0.09);
                CGST = numCgst.toString();
                SGST = numSgst.toString();
                IGST = "-";
            }
            else {
                // For other states: 18% IGST
                numIgst = Math.round(subTotalAmount_Upfront * 0.18);
                CGST = "-";
                SGST = "-";
                IGST = numIgst.toString();
            }

        }
        else {
            if (state === "GJ" || state === "GUJARAT") {
                numCgst = Math.round(baseAmount * 0.09);
                numSgst = Math.round(baseAmount * 0.09);
                CGST = numCgst.toString();
                SGST = numSgst.toString();
                IGST = "-";
            }
            else {
                // For other states: 18% IGST
                numIgst = Math.round(baseAmount * 0.18);
                CGST = "-";
                SGST = "-";
                IGST = numIgst.toString();
            }
        }


        // Conditionally calculate commission and TDS
        if (invoiceData.Paymentmode === 'Upfront Commission') {


            lessCommission = Math.round((subTotalAmount_Upfront * payoutPercentage) / 100);
            tdsAmount = Math.round(lessCommission * 0.02); // 2% TDS on the commission amount

            lessCommissionWords_Upfront = this.numberToWords(lessCommission);

            // Calculate the new total amount
            let newTotal = (subTotalAmount_Upfront + numCgst + numSgst + numIgst + tdsAmount) - lessCommission;
            finalTotalAmount_Upfront = Math.round(Actual_PremiumAmount_Upfront);
            finalWordsAmount_Upfront = this.numberToWords(finalTotalAmount_Upfront);

            finalpayout_commisionAmount = newTotal;


        }

        // Return processed data with tax calculations
        return {
            ...invoiceData,
            CGST: CGST,
            SGST: SGST,
            IGST: IGST,
            lessCommission: lessCommission, // Pass calculated commission
            tdsAmount: tdsAmount,         // Pass calculated TDS
            totalamount: finalTotalAmount.toString(), // Pass the final calculated total amount
            Wordsamount: finalWordsAmount, // Pass the new words amount
            Asnumber: invoiceData.Asnumber || '',

            // Include agent details
            AgentId: invoiceData.AgentId || '',
            Agent_Code: invoiceData.Agent_Code || '',
            FullName_Agent: invoiceData.FullName_Agent || '',
            GST_Agent: invoiceData.GST_Agent || '',
            Address_Agent: invoiceData.Address_Agent || '',
            PAN_No_Agent: invoiceData.PAN_No_Agent || '',
            Paymentmode: invoiceData.Paymentmode || '',
            Payout: invoiceData.Payout || '',
            upfron_InvoiceNo: invoiceData.upfron_InvoiceNo || '',
            Agent_EmailID: invoiceData.Agent_EmailID || '',
            Agent_MobileNumber: invoiceData.Agent_MobileNumber || '',
            finalTotalAmount_Upfront: finalTotalAmount_Upfront || '',
            finalWordsAmount_Upfront: finalWordsAmount_Upfront || '',
            Actual_PremiumAmount_Upfront: Actual_PremiumAmount_Upfront || '',
            subTotalAmount_Upfront: subTotalAmount_Upfront || '',
            finalpayout_commisionAmount: finalpayout_commisionAmount || '',
            lessCommissionWords_Upfront: lessCommissionWords_Upfront || ''


        };
    }

    /**
     * Delete HTML file
     * @param {string} custId - Customer ID
     * @returns {boolean} - Success status
     */
    deleteHtmlFile(custId) {
        try {
            const htmlFileName = `Invoice${custId}.html`;
            const htmlFilePath = path.join(this.htmlStorePath, htmlFileName);

            if (fs.existsSync(htmlFilePath)) {
                fs.unlinkSync(htmlFilePath);
                logger.info(`Deleted HTML file: ${htmlFilePath}`);
                return true;
            }
            return false;
        } catch (error) {
            logger.error('Error deleting HTML file:', error);
            return false;
        }
    }

    /**
     * Check if HTML file exists
     * @param {string} custId - Customer ID
     * @returns {boolean} - Existence status
     */
    htmlFileExists(custId) {
        try {
            const htmlFileName = `Invoice${custId}.html`;
            const htmlFilePath = path.join(this.htmlStorePath, htmlFileName);
            return fs.existsSync(htmlFilePath);
        } catch (error) {
            logger.error('Error checking HTML file existence:', error);
            return false;
        }
    }

    /**
     * Get HTML file path and URL
     * @param {string} custId - Customer ID
     * @returns {Object|null} - Object containing HTML file path and URL, or null if not found
     */
    getHtmlFileInfo(custId) {
        try {
            const htmlFileName = `Invoice${custId}.html`;
            const htmlFilePath = path.join(this.htmlStorePath, htmlFileName);
            const htmlUrl = `/html/${htmlFileName}`;

            if (fs.existsSync(htmlFilePath)) {
                return {
                    htmlPath: htmlFilePath,
                    htmlUrl: htmlUrl,
                    exists: true
                };
            }
            return null;
        } catch (error) {
            logger.error('Error getting HTML file info:', error);
            return null;
        }
    }

    /**
     * List all HTML files in the directory
     * @returns {Array} - Array of HTML file information
     */
    listHtmlFiles() {
        try {
            const files = fs.readdirSync(this.htmlStorePath);
            const htmlFiles = files
                .filter(file => file.endsWith('.html'))
                .map(file => {
                    const filePath = path.join(this.htmlStorePath, file);
                    const stats = fs.statSync(filePath);
                    return {
                        filename: file,
                        path: filePath,
                        url: `/html/${file}`,
                        size: stats.size,
                        created: stats.birthtime,
                        modified: stats.mtime
                    };
                });

            return htmlFiles;
        } catch (error) {
            logger.error('Error listing HTML files:', error);
            return [];
        }
    }

    /**
     * Clean up old HTML files (older than specified days)
     * @param {number} daysOld - Number of days (default: 30)
     * @returns {number} - Number of files deleted
     */
    cleanupOldHtmlFiles(daysOld = 30) {
        try {
            const files = fs.readdirSync(this.htmlStorePath);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            let deletedCount = 0;

            files.forEach(file => {
                if (file.endsWith('.html')) {
                    const filePath = path.join(this.htmlStorePath, file);
                    const stats = fs.statSync(filePath);

                    if (stats.mtime < cutoffDate) {
                        fs.unlinkSync(filePath);
                        logger.info(`Deleted old HTML file: ${file}`);
                        deletedCount++;
                    }
                }
            });

            logger.info(`Cleaned up ${deletedCount} old HTML files`);
            return deletedCount;
        } catch (error) {
            logger.error('Error cleaning up old HTML files:', error);
            return 0;
        }
    }
}

module.exports = new InvoiceService();