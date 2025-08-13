const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const logger = require('../bin/Logger');
const QRCode = require('qrcode');
const puppeteer = require('puppeteer'); // Use puppeteer instead of phantom

class PolicyService {
    constructor() {
        this.pdfStorePath = './public/policy/';
        this.htmlStorePath = './public/html/';
        this.qrCodeStorePath = './public/qrcodes/';
        this.templatesPath = path.join(__dirname, '../views/templates');
        this.imagesPath = path.join(__dirname, '../public/images');

        // Ensure directories exist at startup
        this.ensureDirectories();
    }

    /**
     * Generate both PDF and HTML for a policy
     * @param {string} policyNo - Policy number
     * @param {Object} policyData - Policy data from database
     * @param {Function} callback - Callback function
     */
    async generatePolicy(policyNo, policyData, callback) {
        let browser = null;
        
        try {
            logger.info(`Starting policy generation for policy ${policyNo}`);
            
            // Process the policy data for the template
            const processed = this.preparePolicyData(policyData);
            
            // Define file paths with timestamp to avoid conflicts
            const timestamp = Date.now();
            const pdfPath = path.join(this.pdfStorePath, `${policyNo}_${timestamp}.pdf`);
            const htmlPath = path.join(this.htmlStorePath, `${policyNo}.html`);
            const qrCodePath = path.join(this.qrCodeStorePath, `${policyNo}-qr.png`);
            
            // Generate QR code with policy info
            const qrCodeData = this.generateQRCodeData(processed);
            logger.info(`Generated QR code data for policy ${policyNo}`);
            
            try {
                // Generate QR code and save it as an image
                await QRCode.toFile(qrCodePath, qrCodeData, {
                    errorCorrectionLevel: 'H',
                    margin: 1,
                    width: 180,
                    color: {
                        dark: '#000',
                        light: '#fff'
                    }
                });
                logger.info(`QR code saved to ${qrCodePath}`);
                
                // Read the QR code as base64 for embedding directly in HTML
                const qrCodeBase64 = await this.imageToBase64(qrCodePath);
                
                // Add QR code URLs to processed data
                processed.qrCodeUrl = `/qrcodes/${policyNo}-qr.png`; // URL for HTML
                processed.qrCodeBase64 = qrCodeBase64; // Base64 for PDF embedding
                
                // Check if template exists
                const templatePath = path.join(this.templatesPath, 'coi-template-new.ejs');
                if (!fs.existsSync(templatePath)) {
                    logger.error(`Template file not found: ${templatePath}`);
                    return callback(new Error(`Template file not found: ${templatePath}`), null);
                }
                
                logger.info(`Rendering EJS template for policy ${policyNo}`);
                
                // Render EJS template
                ejs.renderFile(
                    templatePath,
                    { policy: processed },
                    async (err, renderedHtml) => {
                        if (err) {
                            logger.error(`Error rendering template for policy ${policyNo}:`, err);
                            return callback(err, null);
                        }
                        
                        // Replace image URLs with base64 data for PDF
                        let enhancedHtml = this.enhanceHtmlForPDF(renderedHtml);
                        
                        // Replace QR code URL with base64 data for PDF
                        enhancedHtml = enhancedHtml.replace(
                            new RegExp(`src="[^"]*${policyNo}-qr.png"`, 'g'),
                            `src="${qrCodeBase64}"`
                        );
                        
                        // Fix whitespace issues in HTML
                        enhancedHtml = this.fixWhitespace(enhancedHtml);
                        
                        // Save HTML file (original, not enhanced)
                        fs.writeFile(htmlPath, renderedHtml, 'utf8', async (htmlErr) => {
                            if (htmlErr) {
                                logger.error(`Error saving HTML for policy ${policyNo}:`, htmlErr);
                                return callback(htmlErr, null);
                            }
                            
                            logger.info(`HTML saved to ${htmlPath}`);
                            
                            // Create a timeout protection mechanism
                            const pdfTimeout = setTimeout(() => {
                                logger.error(`PDF generation timed out for policy ${policyNo}`);
                                
                                // If browser is still open, close it
                                if (browser) {
                                    try {
                                        browser.close().catch(() => {});
                                    } catch (e) { 
                                        logger.error(`Error closing browser: ${e.message}`);
                                    }
                                }
                                
                                return callback(new Error(`PDF generation timed out after 60 seconds`), {
                                    htmlPath: htmlPath,
                                    htmlContent: renderedHtml
                                });
                            }, 60000); // 60 second timeout
                            
                            try {
                                logger.info(`Starting PDF generation with Puppeteer for policy ${policyNo}`);
                                
                                // Launch Puppeteer browser
                                browser = await puppeteer.launch({
                                    headless: 'new',
                                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                                });
                                
                                const page = await browser.newPage();
                                
                                // Set viewport for A4 size
                                await page.setViewport({
                                    width: 1240,
                                    height: 1754,
                                    deviceScaleFactor: 1
                                });
                                
                                // Set content
                                await page.setContent(enhancedHtml, { 
                                    waitUntil: 'networkidle0',
                                    timeout: 30000 
                                });
                                
                                // Add a slight delay to ensure everything is rendered
                                await page.waitForTimeout(1000);
                                
                                // Run JavaScript in the page to fix spacing issues
                                await page.evaluate(() => {
                                    // Fix whitespace in tables and other elements
                                    const tables = document.querySelectorAll('table');
                                    tables.forEach(table => {
                                        // Set table layout to fixed to prevent auto-sizing
                                        table.style.tableLayout = 'fixed';
                                        table.style.width = '100%';
                                        
                                        // Fix cell spacing
                                        const cells = table.querySelectorAll('td, th');
                                        cells.forEach(cell => {
                                            cell.style.padding = '4px 8px';
                                            cell.style.whiteSpace = 'normal';
                                            cell.style.wordWrap = 'break-word';
                                        });
                                    });
                                    
                                    // Remove unnecessary whitespace in paragraphs
                                    const paragraphs = document.querySelectorAll('p');
                                    paragraphs.forEach(p => {
                                        p.style.margin = '2px 0';
                                        p.style.padding = '0';
                                    });
                                    
                                    // Fix div spacing
                                    const divs = document.querySelectorAll('div');
                                    divs.forEach(div => {
                                        if (!div.classList.contains('page') && 
                                            !div.classList.contains('content')) {
                                            div.style.margin = '0';
                                            div.style.padding = '0';
                                        }
                                    });
                                });
                                
                                // Generate PDF with optimized settings for proper space handling
                                await page.pdf({
                                    path: pdfPath,
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
                                
                                // Clear the timeout as PDF generation is complete
                                clearTimeout(pdfTimeout);
                                
                                // Close the browser
                                await browser.close();
                                browser = null;
                                
                                logger.info(`PDF generated at ${pdfPath}`);
                                
                                return callback(null, {
                                    pdfPath: pdfPath,
                                    htmlPath: htmlPath,
                                    qrCodePath: qrCodePath,
                                    htmlContent: renderedHtml,
                                    processedData: processed
                                });
                            } catch (pdfErr) {
                                clearTimeout(pdfTimeout);
                                
                                // Close the browser if it's still open
                                if (browser) {
                                    try {
                                        await browser.close();
                                    } catch (e) {}
                                    browser = null;
                                }
                                
                                logger.error(`Error generating PDF for policy ${policyNo}:`, pdfErr);
                                
                                // Try fallback method
                                try {
                                    const fallbackPath = path.join(this.pdfStorePath, `${policyNo}_fallback_${timestamp}.pdf`);
                                    await this.generatePdfWithFallback(enhancedHtml, fallbackPath);
                                    
                                    logger.info(`Fallback PDF generated at ${fallbackPath}`);
                                    
                                    return callback(null, {
                                        pdfPath: fallbackPath,
                                        htmlPath: htmlPath,
                                        qrCodePath: qrCodePath,
                                        htmlContent: renderedHtml,
                                        processedData: processed
                                    });
                                } catch (fallbackErr) {
                                    logger.error(`Fallback PDF generation failed for policy ${policyNo}:`, fallbackErr);
                                    
                                    return callback(pdfErr, {
                                        htmlPath: htmlPath,
                                        htmlContent: renderedHtml
                                    });
                                }
                            }
                        });
                    }
                );
            } catch (qrError) {
                logger.error(`Error generating QR code for policy ${policyNo}:`, qrError);
                return callback(qrError, null);
            }
        } catch (error) {
            // Make sure browser is closed if there's an error
            if (browser) {
                try {
                    await browser.close();
                } catch (e) {}
            }
            
            logger.error(`Error in generate policy for ${policyNo}:`, error);
            callback(error, null);
        }
    }
    
    /**
     * Fix whitespace issues in HTML
     * @param {string} html - HTML content
     * @returns {string} - Corrected HTML
     */
    fixWhitespace(html) {
        // Fix multiple consecutive whitespace
        let fixed = html.replace(/\s{2,}/g, ' ');
        
        // Fix whitespace between tags
        fixed = fixed.replace(/>\s+</g, '><');
        
        // Fix whitespace in div tags
        fixed = fixed.replace(/<div\s+/g, '<div ');
        fixed = fixed.replace(/\s+\/>/g, '/>');
        
        // Fix empty paragraphs that cause extra space
        fixed = fixed.replace(/<p>\s*<\/p>/g, '');
        
        // Fix extra line breaks
        fixed = fixed.replace(/\n\s*\n/g, '\n');
        
        // Fix spacing in table cells
        fixed = fixed.replace(/<td\s+/g, '<td ');
        fixed = fixed.replace(/<th\s+/g, '<th ');
        
        return fixed;
    }
    
    /**
     * Fallback PDF generation method using other libraries
     * @param {string} html - HTML content
     * @param {string} outputPath - Output file path
     */
    async generatePdfWithFallback(html, outputPath) {
        try {
            logger.info(`Attempting fallback PDF generation to ${outputPath}`);
            
            // Try with html-pdf
            try {
                const pdf = require('html-pdf');
                
                return new Promise((resolve, reject) => {
                    pdf.create(html, {
                        format: 'A4',
                        border: {
                            top: '10mm',
                            right: '10mm',
                            bottom: '10mm',
                            left: '10mm'
                        },
                        timeout: 60000,
                        renderDelay: 2000
                    }).toFile(outputPath, (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
            } catch (htmlPdfError) {
                logger.error(`HTML-PDF fallback failed: ${htmlPdfError.message}`);
                
                // Write a simple text file as a last resort
                const errorMessage = `PDF generation failed. Please view the HTML version.\nError: ${htmlPdfError.message}`;
                fs.writeFileSync(outputPath + '.txt', errorMessage);
                throw new Error('All PDF generation methods failed');
            }
        } catch (error) {
            logger.error(`All PDF fallbacks failed: ${error.message}`);
            const errorMessage = `PDF generation failed. Please view the HTML version.\nError: ${error.message}`;
            fs.writeFileSync(outputPath + '.txt', errorMessage);
            throw new Error('All PDF generation methods failed');
        }
    }

    /**
     * Generate only HTML for a policy
     * @param {string} policyNo - Policy number
     * @param {Object} policyData - Policy data
     * @param {Function} callback - Callback function
     */
    async generatePolicyHTML(policyNo, policyData, callback) {
        try {
            logger.info(`Starting HTML-only generation for policy ${policyNo}`);
            
            // Process the policy data for the template
            const processed = this.preparePolicyData(policyData);
            
            // Define file paths
            const htmlPath = path.join(this.htmlStorePath, `${policyNo}.html`);
            const qrCodePath = path.join(this.qrCodeStorePath, `${policyNo}-qr.png`);
            
            // Generate QR code with policy info
            const qrCodeData = this.generateQRCodeData(processed);
            
            try {
                // Generate QR code and save it as an image
                await QRCode.toFile(qrCodePath, qrCodeData, {
                    errorCorrectionLevel: 'H',
                    margin: 1,
                    width: 180,
                    color: {
                        dark: '#000',
                        light: '#fff'
                    }
                });
                logger.info(`QR code saved to ${qrCodePath}`);
                
                // Create a public-facing URL for the QR code
                processed.qrCodeUrl = `/qrcodes/${policyNo}-qr.png`;
                
                // Check if template exists
                const templatePath = path.join(this.templatesPath, 'coi-template-new.ejs');
                if (!fs.existsSync(templatePath)) {
                    logger.error(`Template file not found: ${templatePath}`);
                    return callback(new Error(`Template file not found: ${templatePath}`), null);
                }
                
                // Render EJS template
                ejs.renderFile(
                    templatePath,
                    { policy: processed },
                    (err, renderedHtml) => {
                        if (err) {
                            logger.error(`Error rendering template for policy ${policyNo} (HTML only):`, err);
                            return callback(err, null);
                        }
                        
                        // Fix whitespace issues in HTML
                        const fixedHtml = this.fixWhitespace(renderedHtml);
                        
                        // Save HTML file
                        fs.writeFile(htmlPath, fixedHtml, 'utf8', (htmlErr) => {
                            if (htmlErr) {
                                logger.error(`Error saving HTML for policy ${policyNo}:`, htmlErr);
                                return callback(htmlErr, { htmlContent: fixedHtml });
                            }
                            
                            logger.info(`HTML saved to ${htmlPath}`);
                            
                            return callback(null, {
                                htmlPath: htmlPath,
                                qrCodePath: qrCodePath,
                                htmlContent: fixedHtml,
                                processedData: processed
                            });
                        });
                    }
                );
            } catch (qrError) {
                logger.error(`Error generating QR code for policy ${policyNo} (HTML only):`, qrError);
                return callback(qrError, null);
            }
        } catch (error) {
            logger.error(`Error in generate policy HTML for ${policyNo}:`, error);
            callback(error, null);
        }
    }
    
    /**
     * Generate a sample policy for testing
     * @param {Function} callback - Callback function
     */
    generateSamplePolicy(callback) {
        logger.info('Generating sample policy for testing');
        
        const sampleData = {
            Policy_No: 'SAMPLE' + Date.now(),
            FirstName: 'Gunja',
            MiddleName: 'nirmal',
            LastName: 'charsao',
            Gender: 'FEMALE',
            AddressLine1: 'sion room1a',
            AddressLine2: 'rajiv nagara',
            CityName: 'mumbai',
            State: 'MAHARASHTRA',
            PinCode: '400087',
            EmailID: 'Test12345@gmail.com',
            MobileNumber: '9846678921',
            PolicyStartDate: new Date('2025-05-15'),
            PolicyEndDate: new Date('2025-06-03'),
            PlanName: 'Travel Insurance Plan',
            CompanyName: 'Interstellar Services Pvt. Ltd.',
            PassportNumber: 'A2096448',
            NomineeName: 'Rudra',
            RelationshipOfTheNomineeWithInsured: 'SON',
            GeographicalCoverage: 'Worldwide',
            VisitingCountry: 'Multiple',
            GSTIN: 'EUROP ASSISTANCE GST No.',
            ABHA_ID: 'N/A',
            PreExistingDisease: 'NO',
            MasterPolicyNo: 'RGICL-MP-2024',
            BranchCode: 'RGICL-BR-2024',
            PSONo: '2846234',
            Department: '2822',
            IntermediaryCode: 'DIR',
            Salutation: 'Ms.',
            Premium: '349.28',
            ProposalNo: 'Y042125000303',
            BusinessType: 'New Business'
        };
        
        this.generatePolicy(sampleData.Policy_No, sampleData, callback);
    }
    
    /**
     * Convert an image file to base64 string
     * @param {string} imagePath - Path to image file
     * @returns {Promise<string>} - Base64 encoded image
     */
    async imageToBase64(imagePath) {
        try {
            // Read the image file
            const imageData = await fs.promises.readFile(imagePath);
            
            // Convert to base64
            const base64Data = imageData.toString('base64');
            
            // Determine MIME type
            let mimeType = 'image/png';
            if (imagePath.toLowerCase().endsWith('.jpg') || imagePath.toLowerCase().endsWith('.jpeg')) {
                mimeType = 'image/jpeg';
            }
            
            // Return as data URL
            return `data:${mimeType};base64,${base64Data}`;
        } catch (error) {
            logger.error('Error converting image to base64:', error);
            return '';
        }
    }
    
    /**
     * Generate QR code data from policy information
     * @param {Object} policyData - Processed policy data
     * @returns {string} - QR code content
     */
    generateQRCodeData(policyData) {
        // Format the data similar to what's shown in the image
        return `PolicyNo:${policyData.Policy_No} | Salutation:${policyData.Salutation || 'Ms.'} | CustName:${policyData.fullName} | Prod:${policyData.Department || '2822'} | RSD:${policyData.formattedStartDate} | RED:${policyData.formattedEndDate} | PREM:${policyData.Premium || '349.28'} | ProposalNo:${policyData.ProposalNo || 'Y042125000303'} | BusinessType:${policyData.BusinessType || 'New Business'}`;
    }
    
    /**
     * Enhance HTML content for better PDF rendering without changing layout
     * @param {string} htmlContent - Original HTML content
     * @returns {string} - Enhanced HTML for PDF rendering
     */
    enhanceHtmlForPDF(htmlContent) {
        try {
            // Add styles to ensure full width in PDF without modifying the original structure
            const fullWidthStyles = `
                <style id="pdf-enhancements">
                /* Ensure tables maintain their full width in PDF */
                table {
                    width: 100% !important;
                    max-width: none !important;
                    table-layout: fixed !important;
                    page-break-inside: auto !important;
                    border-collapse: collapse !important;
                }
                
                /* Prevent content compression */
                body {
                    width: 100% !important;
                    max-width: none !important;
                    margin: 0 !important;
                    padding: 5px !important;
                    line-height: 1.3 !important;
                }
                
                /* Ensure all elements are visible */
                * {
                    overflow: visible !important;
                    box-sizing: border-box !important;
                }
                
                /* Ensure the page takes full width */
                .page {
                    width: 100% !important;
                    max-width: none !important;
                    padding: 5px !important;
                    margin-bottom: 5px !important;
                }
                
                /* Force QR code image to display properly */
                .scanner img {
                    display: block !important;
                    visibility: visible !important;
                    width: 180px !important;
                    height: auto !important;
                    margin: 0 auto !important;
                    object-fit: contain !important;
                    print-color-adjust: exact !important;
                    border: none !important;
                }
                
                /* Enhanced header layout */
                header {
                    display: table !important;
                    width: 100% !important;
                    table-layout: fixed !important;
                    height: auto !important;
                    min-height: 100px !important;
                }
                
                /* Fix header columns */
                .logo, .scanner, .signed, .contact-details {
                    display: table-cell !important;
                    width: 25% !important;
                    vertical-align: top !important;
                }
                
                /* Force all cells to take proper space */
                td, th {
                    word-wrap: break-word !important;
                    overflow-wrap: break-word !important;
                    white-space: normal !important;
                    vertical-align: top !important;
                    font-size: 11px !important; /* Slightly smaller font to fit content */
                    padding: 4px 6px !important;
                    line-height: 1.2 !important;
                }
                
                /* Fix image rendering in PDF */
                img {
                    print-color-adjust: exact !important;
                }
                
                /* Set specific widths for problematic columns */
                table tr td:nth-child(1) {
                    width: 15% !important;
                    word-break: break-word !important;
                }
                
                /* Ensure column headers wrap properly */
                th {
                    word-wrap: break-word !important;
                    overflow-wrap: break-word !important;
                    white-space: normal !important;
                    font-weight: bold !important;
                    padding: 4px 6px !important;
                }
                
                /* Fix for ABHA ID column */
                td:last-child, th:last-child {
                    width: 15% !important;
                    white-space: normal !important;
                    word-break: break-word !important;
                }
                
                /* Ensure text wraps in all cells */
                p {
                    word-wrap: break-word !important;
                    white-space: normal !important;
                    margin: 2px 0 !important;
                    padding: 0 !important;
                    line-height: 1.3 !important;
                }
                
                /* Fix for relationship column */
                td:nth-last-child(2), th:nth-last-child(2) {
                    width: 15% !important;
                    word-break: break-word !important;
                }
                
                /* Fix div spacing */
                div {
                    margin: 0 !important;
                    padding: 0 !important;
                }
                
                /* Apply consistent print settings */
                @media print {
                    @page {
                        size: A4;
                        margin: 10mm;
                    }
                    
                    html {
                        zoom: 0.7;
                        print-color-adjust: exact;
                    }
                    
                    body {
                        width: 100%;
                        margin: 0;
                        padding: 5px;
                    }
                }
                </style>
            `;
            
            // Add styles right before the closing </head> tag
            return htmlContent.replace('</head>', `${fullWidthStyles}</head>`);
        } catch (error) {
            logger.error('Error enhancing HTML for PDF:', error);
            // Return original HTML if enhancement fails
            return htmlContent;
        }
    }
    
    /**
     * Prepare and format policy data for the template
     * @param {Object} policyData - Raw policy data
     * @returns {Object} - Formatted policy data
     */
    preparePolicyData(policyData) {
        // Format date
        const formatDate = (dateString) => {
            if (!dateString) return 'N/A';
            try {
                const date = new Date(dateString);
                return `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
            } catch (e) {
                return 'N/A';
            }
        };
        
        // Current date
        const currentDate = new Date();
        const formattedCurrentDate = formatDate(currentDate);
        
        // Digital signing date format
        const signDate = `${currentDate.getFullYear()}.${(currentDate.getMonth() + 1).toString().padStart(2, '0')}.${currentDate.getDate().toString().padStart(2, '0')} ${currentDate.getHours().toString().padStart(2, '0')}:${currentDate.getMinutes().toString().padStart(2, '0')}:${currentDate.getSeconds().toString().padStart(2, '0')} IST`;
        
        // Format full name
        const fullName = [
            policyData.FirstName || '',
            policyData.MiddleName || '',
            policyData.LastName || ''
        ].filter(Boolean).join(' ');
        
        // Format address
        const addressParts = [
            policyData.AddressLine1 || '',
            policyData.AddressLine2 || '',
            policyData.CityName || '',
            policyData.State || '',
            policyData.PinCode || ''
        ];
        
        const fullAddress = addressParts
            .filter(part => part && part.trim())
            .join(', ');
        
        // Calculate trip duration
        let tripDuration = 'N/A';
        let formattedStartDate = formatDate(policyData.PolicyStartDate);
        let formattedEndDate = formatDate(policyData.PolicyEndDate);
        
        if (policyData.PolicyStartDate && policyData.PolicyEndDate) {
            const start = new Date(policyData.PolicyStartDate);
            const end = new Date(policyData.PolicyEndDate);
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            tripDuration = `${diffDays} days`;
        }
        
        // Return processed data
        return {
            ...policyData,
            fullName,
            fullAddress,
            formattedStartDate,
            formattedEndDate,
            formattedCurrentDate,
            currentDate: signDate, // Use signDate for currentDate to avoid variable conflicts
            tripDuration,
            PassportNumber: policyData.PassportNumber || policyData.PassportNo || 'N/A',
            Gender: policyData.Gender || 'N/A',
            NomineeName: policyData.NomineeName || 'N/A',
            RelationshipOfTheNomineeWithInsured: policyData.RelationshipOfTheNomineeWithInsured || 'N/A',
            ABHA_ID: policyData.ABHA_ID || 'N/A',
            EmailID: policyData.EmailID || 'N/A',
            MobileNumber: policyData.MobileNumber || 'N/A',
            GSTIN: policyData.GSTIN || 'EUROP ASSISTANCE GST No.',
            GeographicalCoverage: policyData.GeographicalCoverage || 'Worldwide',
            VisitingCountry: policyData.VisitingCountry || 'Multiple',
            PlanName: policyData.PlanName || 'Travel Insurance Plan',
            PreExistingDisease: policyData.PreExistingDisease || 'NO',
            CompanyName: policyData.CompanyName || 'Interstellar Services Pvt. Ltd.',
            MasterPolicyNo: policyData.MasterPolicyNo || 'RGICL-MP-2024',
            BranchCode: policyData.BranchCode || 'RGICL-BR-2024',
            PSONo: policyData.PSONo || '2846234',
            Department: policyData.Department || '2822',
            IntermediaryCode: policyData.IntermediaryCode || 'DIR',
            Salutation: policyData.Salutation || 'Ms.',
            Premium: policyData.Premium || '349.28',
            ProposalNo: policyData.ProposalNo || 'Y042125000303',
            BusinessType: policyData.BusinessType || 'New Business'
        };
    }
    
    /**
     * Ensure all required directories exist
     */
    ensureDirectories() {
        try {
            // Create PDF directory if it doesn't exist
            if (!fs.existsSync(this.pdfStorePath)) {
                fs.mkdirSync(this.pdfStorePath, { recursive: true });
                logger.info(`Created PDF directory: ${this.pdfStorePath}`);
            }
            
            // Create HTML directory if it doesn't exist
            if (!fs.existsSync(this.htmlStorePath)) {
                fs.mkdirSync(this.htmlStorePath, { recursive: true });
                logger.info(`Created HTML directory: ${this.htmlStorePath}`);
            }
            
            // Create QR Code directory if it doesn't exist
            if (!fs.existsSync(this.qrCodeStorePath)) {
                fs.mkdirSync(this.qrCodeStorePath, { recursive: true });
                logger.info(`Created QR Code directory: ${this.qrCodeStorePath}`);
            }
            
            // Create images directory if it doesn't exist
            if (!fs.existsSync(this.imagesPath)) {
                fs.mkdirSync(this.imagesPath, { recursive: true });
                logger.info(`Created images directory: ${this.imagesPath}`);
            }
        } catch (error) {
            logger.error('Error ensuring directories exist:', error);
        }
    }
}

module.exports = new PolicyService();