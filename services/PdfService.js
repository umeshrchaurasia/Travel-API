// services/PdfService.js
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

class PdfService {
  constructor() {
    this.templatesPath = path.join(__dirname, '../views/templates');
    this.outputPath = path.join(__dirname, '../public/pdfs');
    this.ensureOutputDirectory();
  }

  ensureOutputDirectory() {
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath, { recursive: true });
    }
  }

  async generatePdf(policyData) {
    const templatePath = path.join(this.templatesPath, 'coi-template-new.ejs');

    if (!fs.existsSync(templatePath)) {
      throw new Error('Template file not found');
    }

    const htmlContent = await ejs.renderFile(templatePath, { policy: policyData });

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const fileName = `${policyData.Policy_No}_${Date.now()}.pdf`;
    const pdfPath = path.join(this.outputPath, fileName);

    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });

    await browser.close();
    return {
      pdfPath: `/pdfs/${fileName}`,
      fullPdfPath: pdfPath,
    };
  }
}

module.exports = new PdfService();
