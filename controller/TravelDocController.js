// controller/TravelDocController.js

const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const express = require('express');

class TravelDocController {
    constructor() {
        this.VALID_DOC_TYPES = {
            'pancard': 'PAN Card',
            'bankdetails': 'Bank details',
            'gst': 'GST Certificate',
            'msme': 'MSME Certificate',
            'addressproof': 'Address proof',
            'other': 'Other document'
        };

        this.ALLOWED_FILE_TYPES = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };

        this.router = express.Router();
        
        this.storage = multer.diskStorage({
            destination: (req, file, cb) => {
                try {
                    const tempDir = path.join(__dirname, '../public/uploads/temp');
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                    }
                    cb(null, tempDir);
                } catch (error) {
                    logger.error('Error in destination:', error);
                    cb(error);
                }
            },
            filename: (req, file, cb) => {
                try {
                    const fileExt = this.getFileExtension(file.originalname);
                    if (!fileExt) {
                        throw new Error('Invalid file extension');
                    }
                    const tempFilename = `temp-${Date.now()}${fileExt}`;
                    cb(null, tempFilename);
                } catch (error) {
                    logger.error('Error in filename:', error);
                    cb(error);
                }
            }
        });

        this.upload = multer({
            storage: this.storage,
            fileFilter: (req, file, cb) => {
                const fileExt = this.getFileExtension(file.originalname);
                if (!fileExt || !this.ALLOWED_FILE_TYPES[fileExt]) {
                    cb(new Error('Invalid file type. Only PDF, JPEG, JPG, PNG, DOC, and DOCX files are allowed.'), false);
                    return;
                }

                if (file.mimetype === this.ALLOWED_FILE_TYPES[fileExt]) {
                    cb(null, true);
                } else {
                    cb(new Error('File type does not match extension.'), false);
                }
            },
            limits: {
                fileSize: 4 * 1024 * 1024 // 4MB limit
            }
        });
    }

    standardizeDocType(docType) {
        if (!docType) return null;
        const normalized = docType.toLowerCase().replace(/\s+/g, '');
        const match = Object.entries(this.VALID_DOC_TYPES).find(([key]) => 
            key === normalized || 
            key.includes(normalized) || 
            normalized.includes(key)
        );
        return match ? match[0] : null;
    }

    getFileExtension(filename) {
        const ext = path.extname(filename).toLowerCase();
        return this.ALLOWED_FILE_TYPES.hasOwnProperty(ext) ? ext : null;
    }

    async moveFile(oldPath, newPath) {
        return new Promise((resolve, reject) => {
            fs.rename(oldPath, newPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    getUploadMiddleware() {
        return [
            // First middleware to handle file upload
            (req, res, next) => {
                // FIX: Increase timeout to 5 minutes to prevent disconnection on slow uploads
                req.setTimeout(300000); 

                this.upload.single('document')(req, res, async (err) => {
                    // FIX: Explicitly handle File Too Large error from Multer
                    if (err instanceof multer.MulterError) {
                        if (err.code === 'LIMIT_FILE_SIZE') {
                            logger.error('Upload error: File too large');
                            return base.send_response("File size exceeds the 4MB limit.", null, res);
                        }
                    }
                    
                    if (err) {
                        logger.error('Upload error:', err);
                        return base.send_response(err.message || "Error uploading file", null, res);
                    }
                    next();
                });
            },
            
            // Second middleware to validate fields
            async (req, res, next) => {
                try {
                    const { agentId, uId, docType } = req.body;
                    
                    logger.info('Received form data:', { agentId, uId, docType });

                    if (!req.file) {
                        return base.send_response("No file uploaded", null, res);
                    }
                    // ... rest of validation logic remains the same ...
                    if (!agentId) return base.send_response("Agent ID is required", null, res);
                    if (!uId) return base.send_response("UID is required", null, res);
                    if (!docType) return base.send_response("Document type is required", null, res);

                    const standardizedDocType = this.standardizeDocType(docType);
                    if (!standardizedDocType) {
                        return base.send_response(
                            `Invalid document type. Valid types are: ${Object.values(this.VALID_DOC_TYPES).join(', ')}`,
                            null, res
                        );
                    }

                    const agentDir = path.join(__dirname, `../public/uploads/agent-documents/${agentId}`);
                    if (!fs.existsSync(agentDir)) {
                        fs.mkdirSync(agentDir, { recursive: true });
                    }

                    const fileExt = path.extname(req.file.filename);
                    const finalFilename = `${standardizedDocType}${fileExt}`;
                    const finalPath = path.join(agentDir, finalFilename);

                    await this.moveFile(req.file.path, finalPath);

                    req.processedData = {
                        agentId, uId, standardizedDocType, finalFilename,
                        relativePath: `${agentId}/${finalFilename}`
                    };

                    next();
                } catch (error) {
                    logger.error('Validation error:', error);
                    if (req.file) fs.unlink(req.file.path, () => {});
                    return base.send_response(error.message || "Validation error", null, res);
                }
            },

            // Final middleware to handle database operations
            async (req, res) => {
                let connection;
                try {
                    const { agentId, uId, standardizedDocType, relativePath } = req.processedData;

                    connection = await db.getConnection();
                    const [result] = await connection.execute(
                        'CALL sp_InsertAgentDocument(?, ?, ?, ?)',
                        [agentId, uId, standardizedDocType, relativePath]
                    );

                    return base.send_response("Document uploaded successfully", {
                        documentId: result[0][0].Doc_Id,
                        fileName: path.basename(relativePath),
                        docType: this.VALID_DOC_TYPES[standardizedDocType],
                        filePath: `/uploads/agent-documents/${relativePath}`
                    }, res);

                } catch (error) {
                    logger.error('Database error:', error);
                    if (req.processedData && req.processedData.relativePath) {
                        const fullPath = path.join(__dirname, '../public/uploads/agent-documents', req.processedData.relativePath);
                        fs.unlink(fullPath, () => {});
                    }
                    return base.send_response(error.message || "Failed to upload document", null, res);
                } finally {
                    if (connection) {
                        connection.release();
                    }
                }
            }
        ];
    }

    async getAgentDocuments(req, res) {
        let connection;
        try {
            const { agentId } = req.params;
            if (!agentId) return base.send_response("Agent ID is required", null, res);

            connection = await db.getConnection();
            const [rows] = await connection.execute(
                'SELECT * FROM Agent_Doc WHERE Agent_Id = ?',
                [agentId]
            );

            const docsWithUrls = rows.map(doc => ({
                ...doc,
                fileUrl: `/uploads/agent-documents/${doc.Doct_Filename}`
            }));

            return base.send_response("Documents retrieved successfully", docsWithUrls, res);
        } catch (error) {
            logger.error('Error fetching agent documents:', error);
            return base.send_response("Failed to fetch agent documents", null, res);
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
}

module.exports = TravelDocController;