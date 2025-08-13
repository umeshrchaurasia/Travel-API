// controller/HtmlToPdfController.js
const pdfService = require('../services/PdfService');
const base = require('./baseController'); // your common response helper

class HtmlToPdfController {
  async convert(req, res) {
    try {
      const { policyData } = req.body;

      if (!policyData || !policyData.Policy_No) {
        return base.send_response('Invalid Policy Data Provided', null, res, 400);
      }

      const pdfResult = await pdfService.generatePdf(policyData);

      return base.send_response('PDF generated successfully', pdfResult, res);
    } catch (error) {
      console.error('PDF generation failed:', error);
      return base.send_response('Error generating PDF', { error: error.message }, res, 500);
    }
  }
}

module.exports = new HtmlToPdfController();
