// create routes for chat enter, send, read etc.

import express from 'express';
import multer from 'multer';

import { botReply, botHealth } from '../controllers/chat.controller.js';
import { uploadImage, getImage, getImageStats } from '../controllers/image.controller.js';

const router = express.Router();

router.get('/bot/health', botHealth);
router.post('/bot/reply', botReply);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        // Keep it small; Huffman coding is CPU-heavy and local storage grows quickly.
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        if (file?.mimetype?.startsWith('image/')) return cb(null, true);
        return cb(new Error('Only image uploads are supported.'), false);
    },
});

// Uploads an image, compresses it losslessly with Huffman coding, stores it locally.
router.post('/images/upload', upload.single('image'), uploadImage);

// Serves the original image bytes (decoded from the stored Huffman container).
router.get('/images/:id', getImage);

// Returns stats and verification results.
router.get('/images/:id/stats', getImageStats);

export default router;

