// // controller/PolicyController.js

// const express = require('express');
// const logger = require('../bin/Logger');
// const path = require('path');
// const fs = require('fs');
// const base = require('./baseController');
// const wrapper = require('./wrapper');
//  // Make sure to install: npm install puppeteer

// // Helper function to enhance HTML for PDF rendering
// function enhanceHtmlForPDF(htmlContent) {
//   try {
//     // Add styles to ensure proper width, scaling, and layout in PDF
//     const enhancedStyles = `
//       <style id="pdf-enhancements">
//         /* Force PDF to display content properly */
//         @page {
//           size: A4;
//           margin: 10mm;
//         }
        
//         html, body {
//           width: 100%;
//           height: 100%;
//           margin: 0;
//           padding: 0;
//           font-family: Arial, sans-serif;
//         }
        
//         /* Ensure tables render correctly */
//         table {
//           width: 100% !important;
//           border-collapse: collapse !important;
//           margin-bottom: 10px !important;
//           page-break-inside: auto !important;
//         }
        
//         table, th, td {
//           border: 1px solid #ddd !important;
//         }
        
//         th, td {
//           padding: 8px !important;
//           text-align: left !important;
//           font-size: 12px !important;
//           word-break: break-word !important;
//           max-width: 200px !important;
//           overflow: visible !important;
//         }
        
//         /* Ensure all content is visible */
//         * {
//           overflow: visible !important;
//           box-sizing: border-box !important;
//         }
        
//         /* Improve text readability */
//         p, span, div {
//           line-height: 1.5 !important;
//           font-size: 12px !important;
//         }
        
//         /* Ensure images display properly */
//         img {
//           max-width: 100% !important;
//           height: auto !important;
//         }
        
//         /* Fix headers and section titles */
//         h1, h2, h3, h4, h5, h6 {
//           margin-top: 12px !important;
//           margin-bottom: 8px !important;
//           page-break-after: avoid !important;
//         }
//       </style>
//     `;
    
//     // Add styles right before the closing </head> tag
//     if (htmlContent.includes('</head>')) {
//       return htmlContent.replace('</head>', `${enhancedStyles}</head>`);
//     } else {
//       // If no head tag, add it at the beginning of the document
//       return `<html><head>${enhancedStyles}</head><body>${htmlContent}</body></html>`;
//     }
//   } catch (error) {
//     logger.error('Error enhancing HTML for PDF:', error);
//     // Return original HTML if enhancement fails
//     return htmlContent;
//   }
// }

// // Main PDF conversion function with improved rendering
// const convertHtmlToPdf = async (req, res) => {
//   let browser = null;
//   try {
//     const htmlFilename = req.body.htmlFilename;
//     const pdfFilename = req.body.pdfFilename || htmlFilename;
    
//     if (!htmlFilename) {
//       return base.send_response("HTML filename is required", null, res);
//     }
    
//     // Define paths
//     const htmlPath = path.join(process.cwd(), 'public', 'html', `${htmlFilename}.html`);
//     const pdfPath = path.join(process.cwd(), 'public', 'policy', `${pdfFilename}.pdf`);
    
//     // Ensure directories exist
//     const pdfDir = path.join(process.cwd(), 'public', 'policy');
//     if (!fs.existsSync(pdfDir)) {
//       fs.mkdirSync(pdfDir, { recursive: true });
//     }
    
//     // Check if HTML file exists
//     if (!fs.existsSync(htmlPath)) {
//       logger.error(`HTML file not found at ${htmlPath}`);
//       return base.send_response(`HTML file ${htmlFilename}.html not found`, null, res);
//     }
    
//     // Read HTML content
//     logger.info(`Reading HTML file from ${htmlPath}`);
//     const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
//     // Enhance HTML for PDF
//     const enhancedHtml = enhanceHtmlForPDF(htmlContent);
    
//     // Create a temporary file with the enhanced HTML
//     const tempDir = path.join(process.cwd(), 'public', 'temp');
//     if (!fs.existsSync(tempDir)) {
//       fs.mkdirSync(tempDir, { recursive: true });
//     }
    
//     const tempHtmlPath = path.join(tempDir, `${htmlFilename}_enhanced_${Date.now()}.html`);
//     fs.writeFileSync(tempHtmlPath, enhancedHtml, 'utf8');
    
//     // Launch puppeteer with improved settings
//     logger.info('Launching Puppeteer browser...');
//     browser = await puppeteer.launch({
//       headless: 'new', // Use the new headless mode (or 'true' for older puppeteer versions)
//       args: [
//         '--no-sandbox',
//         '--disable-setuid-sandbox',
//         '--disable-web-security',
//         '--disable-features=IsolateOrigins,site-per-process',
//         '--disable-dev-shm-usage',
//         '--font-render-hinting=none' // Improves font rendering
//       ]
//     });
    
//     const page = await browser.newPage();
    
//     // Set higher resolution viewport for better quality
//     await page.setViewport({
//       width: 1240,
//       height: 1754,
//       deviceScaleFactor: 2 // Higher resolution for better quality
//     });
    
//     // Load the HTML file with improved settings
//     logger.info(`Loading enhanced HTML from ${tempHtmlPath}`);
//     await page.goto(`file://${tempHtmlPath}`, {
//       waitUntil: 'networkidle0', // Wait until network is completely idle
//       timeout: 90000 // Longer timeout for complex documents
//     });
    
//     // Apply additional styling for better rendering
//     await page.evaluate(() => {
//       // Force all tables to be visible
//       const tables = document.querySelectorAll('table');
//       tables.forEach(table => {
//         table.style.display = 'table';
//         table.style.width = '100%';
//         table.style.tableLayout = 'fixed';
//       });
      
//       // Handle all images
//       const images = document.querySelectorAll('img');
//       images.forEach(img => {
//         if (img.src.startsWith('http')) {
//           img.setAttribute('crossorigin', 'anonymous');
//         }
//         img.style.maxWidth = '100%';
//       });
      
//       // Ensure all text is visible
//       const textElements = document.querySelectorAll('p, span, div, td, th');
//       textElements.forEach(el => {
//         el.style.overflow = 'visible';
//         el.style.whiteSpace = 'normal';
//         el.style.wordBreak = 'break-word';
//       });
//     });
    
//     // Add a longer delay to ensure everything is properly rendered
//     await new Promise(resolve => setTimeout(resolve, 3000));
    
//     // Generate PDF with improved settings
//     logger.info('Generating PDF...');
//     await page.pdf({
//       path: pdfPath,
//       format: 'A4',
//       printBackground: true,
//       margin: {
//         top: '15mm',
//         right: '15mm',
//         bottom: '15mm',
//         left: '15mm'
//       },
//       displayHeaderFooter: false,
//       scale: 0.9, // Improved scale factor
//       preferCSSPageSize: true,
//       landscape: false,
//       omitBackground: false,
//       pageRanges: '', // All pages
//       timeout: 120000 // Longer timeout for complex documents
//     });
    
//     // Close browser
//     await browser.close();
//     browser = null;
    
//     // Clean up temp file
//     try {
//       fs.unlinkSync(tempHtmlPath);
//     } catch (cleanupError) {
//       logger.warn('Error cleaning up temp file:', cleanupError);
//     }
    
//     logger.info(`PDF successfully generated at ${pdfPath}`);
//     return base.send_response("HTML converted to PDF successfully", {
//       htmlFilename: htmlFilename,
//       pdfFilename: pdfFilename,
//       pdfUrl: `/policy/${pdfFilename}.pdf`
//     }, res);
//   } catch (error) {
//     logger.error('Error in convertHtmlToPdf:', error);
    
//     // Make sure browser is closed in case of error
//     if (browser) {
//       try {
//         await browser.close();
//       } catch (closeError) {
//         logger.error('Error closing browser:', closeError);
//       }
//     }
    
//     return base.send_response("Error converting HTML to PDF", null, res);
//   }
// };

// // Fallback method using wkhtmltopdf instead of html-pdf
// const convertHtmlToPdfLegacy = async (req, res) => {
//   try {
//     // Use wkhtmltopdf if available, or html-pdf as a last resort
//     const wkhtmltopdf = require('wkhtmltopdf');
//     const htmlFilename = req.body.htmlFilename;
//     const pdfFilename = req.body.pdfFilename || htmlFilename;
    
//     if (!htmlFilename) {
//       return base.send_response("HTML filename is required", null, res);
//     }
    
//     // Define paths
//     const htmlPath = path.join(process.cwd(), 'public', 'html', `${htmlFilename}.html`);
//     const pdfPath = path.join(process.cwd(), 'public', 'policy', `${pdfFilename}.pdf`);
    
//     // Ensure directories exist
//     const pdfDir = path.join(process.cwd(), 'public', 'policy');
//     if (!fs.existsSync(pdfDir)) {
//       fs.mkdirSync(pdfDir, { recursive: true });
//     }
    
//     // Check if HTML file exists
//     if (!fs.existsSync(htmlPath)) {
//       logger.error(`HTML file not found at ${htmlPath}`);
//       return base.send_response(`HTML file ${htmlFilename}.html not found`, null, res);
//     }
    
//     // Read HTML content
//     logger.info(`Reading HTML file from ${htmlPath}`);
//     const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
//     // Enhance HTML for PDF
//     const enhancedHtml = enhanceHtmlForPDF(htmlContent);
    
//     // Create a temporary file with the enhanced HTML
//     const tempDir = path.join(process.cwd(), 'public', 'temp');
//     if (!fs.existsSync(tempDir)) {
//       fs.mkdirSync(tempDir, { recursive: true });
//     }
    
//     const tempHtmlPath = path.join(tempDir, `${htmlFilename}_enhanced_${Date.now()}.html`);
//     fs.writeFileSync(tempHtmlPath, enhancedHtml, 'utf8');
    
//     // Use wkhtmltopdf with improved settings
//     const wkOptions = [
//       '--enable-local-file-access',
//       '--encoding utf-8',
//       '--page-size A4',
//       '--margin-top 15',
//       '--margin-left 15',
//       '--margin-right 15',
//       '--margin-bottom 15',
//       '--zoom 1.3',
//       '--disable-smart-shrinking',
//       '--print-media-type',
//       '--no-stop-slow-scripts',
//       '--javascript-delay 3000',
//       '--window-status ready',
//       '--log-level info'
//     ];
    
//     logger.info('Starting PDF generation with wkhtmltopdf');
    
//     // Create a promise-based wrapper for wkhtmltopdf
//     return new Promise((resolve, reject) => {
//       const inputStream = fs.createReadStream(tempHtmlPath);
//       const outputStream = fs.createWriteStream(pdfPath);
      
//       // Set up error handling
//       outputStream.on('error', (err) => {
//         logger.error('Output stream error:', err);
//         reject(err);
//       });
      
//       // Run wkhtmltopdf
//       wkhtmltopdf(inputStream, wkOptions, (err, stream) => {
//         if (err) {
//           logger.error('wkhtmltopdf error:', err);
//           // Clean up and reject
//           try {
//             if (fs.existsSync(tempHtmlPath)) {
//               fs.unlinkSync(tempHtmlPath);
//             }
//           } catch (cleanupErr) {
//             logger.warn('Error cleaning up temp file:', cleanupErr);
//           }
//           return base.send_response("Error converting HTML to PDF", null, res);
//         }
        
//         stream.pipe(outputStream);
        
//         // Set up stream completion
//         outputStream.on('finish', () => {
//           logger.info(`PDF successfully generated at ${pdfPath}`);
          
//           // Clean up temp file
//           try {
//             fs.unlinkSync(tempHtmlPath);
//           } catch (cleanupErr) {
//             logger.warn('Error cleaning up temp file:', cleanupErr);
//           }
          
//           return base.send_response("HTML converted to PDF successfully", {
//             htmlFilename: htmlFilename,
//             pdfFilename: pdfFilename,
//             pdfUrl: `/policy/${pdfFilename}.pdf`
//           }, res);
//         });
//       });
//     }).catch(error => {
//       logger.error('Error in convertHtmlToPdfLegacy:', error);
//       return base.send_response("Error converting HTML to PDF", null, res);
//     });
//   } catch (error) {
//     logger.error('Error in convertHtmlToPdfLegacy:', error);
    
//     // Fallback to html-pdf if wkhtmltopdf fails
//     try {
//       const pdf = require('html-pdf');
//       const htmlFilename = req.body.htmlFilename;
//       const pdfFilename = req.body.pdfFilename || htmlFilename;
      
//       const htmlPath = path.join(process.cwd(), 'public', 'html', `${htmlFilename}.html`);
//       const pdfPath = path.join(process.cwd(), 'public', 'policy', `${pdfFilename}.pdf`);
      
//       // Read HTML content
//       const htmlContent = fs.readFileSync(htmlPath, 'utf8');
//       const enhancedHtml = enhanceHtmlForPDF(htmlContent);
      
//       // PDF options for better table rendering
//       const options = {
//         format: 'A4',
//         orientation: 'portrait',
//         border: {
//           top: '15mm',
//           right: '15mm',
//           bottom: '15mm',
//           left: '15mm'
//         },
//         header: { height: '0mm' },
//         footer: { height: '0mm' },
//         timeout: 180000,
//         renderDelay: 3000,
//         zoomFactor: '1.3',
//         quality: '100',
//         dpi: 300
//       };
      
//       pdf.create(enhancedHtml, options).toFile(pdfPath, (err, result) => {
//         if (err) {
//           logger.error('Error with html-pdf fallback:', err);
//           return base.send_response("Error converting HTML to PDF", null, res);
//         }
        
//         logger.info(`PDF successfully generated at ${pdfPath} using html-pdf fallback`);
//         return base.send_response("HTML converted to PDF successfully", {
//           htmlFilename: htmlFilename,
//           pdfFilename: pdfFilename,
//           pdfUrl: `/policy/${pdfFilename}.pdf`
//         }, res);
//       });
//     } catch (fallbackError) {
//       logger.error('Error in html-pdf fallback:', fallbackError);
//       return base.send_response("Error converting HTML to PDF", null, res);
//     }
//   }
// };

// // Additional utility function to check PDF rendering
// const checkPdfStatus = async (req, res) => {
//   try {
//     const pdfFilename = req.query.pdfFilename;
    
//     if (!pdfFilename) {
//       return base.send_response("PDF filename is required", null, res);
//     }
    
//     const pdfPath = path.join(process.cwd(), 'public', 'policy', `${pdfFilename}.pdf`);
    
//     if (!fs.existsSync(pdfPath)) {
//       return base.send_response("PDF file does not exist", null, res);
//     }
    
//     // Get file size and creation time
//     const stats = fs.statSync(pdfPath);
    
//     return base.send_response("PDF status", {
//       pdfFilename: pdfFilename,
//       pdfUrl: `/policy/${pdfFilename}.pdf`,
//       fileSize: `${(stats.size / 1024).toFixed(2)} KB`,
//       createdAt: stats.ctime,
//       exists: true
//     }, res);
//   } catch (error) {
//     logger.error('Error checking PDF status:', error);
//     return base.send_response("Error checking PDF status", null, res);
//   }
// };

// module.exports = {
//   convertHtmlToPdf,
//   convertHtmlToPdfLegacy,
//   checkPdfStatus
// };