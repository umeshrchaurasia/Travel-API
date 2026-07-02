// controllers/DownloadController.js
const fs = require('fs');
const path = require('path');
const logger = require('../bin/Logger'); // Adjust this path if your logger is elsewhere

class DownloadController {
    constructor() {
        // Bind the method so 'this' context is preserved
        this.downloadFileOpen = this.downloadFileOpen.bind(this);
    }

    async downloadFileOpen(req, res) {
        try {
            logger.info('API call received for downloadFileOpen');
            const encodedFilePath = req.query.filePath;

            if (!encodedFilePath) {
                logger.warn('File path is missing from request');
                return res.status(400).send("File path is missing.");
            }

            // 1. Decode the Base64 string back to normal text 
            // Local might be: /policy/filename.pdf
            // Live might be: /travel-api/policy/filename.pdf
            let decodedPath = Buffer.from(encodedFilePath, 'base64').toString('utf-8');
            logger.info(`Original decoded path: ${decodedPath}`);

            // 2. IMPORTANT FIX: Strip out '/travel-api' if it exists in the path
            // because the physical folder is just 'public/policy/'
            if (decodedPath.startsWith('/travel-api')) {
                decodedPath = decodedPath.replace('/travel-api', '');
            }

            // 3. Remove the leading slash if it exists so path.join works correctly
            const safePath = decodedPath.startsWith('/') ? decodedPath.substring(1) : decodedPath;
            
            // 4. Construct the physical file path pointing to your public folder
            const absoluteFilePath = path.join(__dirname, '../public', safePath);

            logger.info(`Attempting to download physical file at: ${absoluteFilePath}`);

            // Check if file exists
            if (!fs.existsSync(absoluteFilePath)) {
                logger.error(`File not found at path: ${absoluteFilePath}`);
                return res.status(404).send("File not found.");
            }

            // Send the file to the user
            res.download(absoluteFilePath, (err) => {
                if (err) {
                    logger.error(`Error sending file: ${err}`);
                    if (!res.headersSent) {
                        res.status(500).send("Error downloading the file.");
                    }
                }
            });

        } catch (error) {
            logger.error(`Error in downloadFileOpen: ${error}`);
            res.status(500).send("Internal Server Error.");
        }
    }
}

module.exports = new DownloadController();