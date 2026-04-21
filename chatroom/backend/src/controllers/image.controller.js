import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { compressHuffman, decompressHuffman } from '../utils/huffman.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

async function ensureUploadsDir() {
    await fs.mkdir(uploadsDir, { recursive: true });
}

function safeId(raw) {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // allow only simple ids we generate
    if (!/^[a-f0-9-]{16,64}$/i.test(trimmed)) return null;
    return trimmed;
}

function safeFilename(name) {
    const base = String(name || 'image').split(/[/\\]/).pop() || 'image';
    // Remove control chars and quotes; keep it simple.
    return base.replace(/[\u0000-\u001f\u007f"']/g, '').slice(0, 120) || 'image';
}

function sha256Hex(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function countByteDiff(a, b) {
    if (a.length !== b.length) return Math.max(a.length, b.length);
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) diff++;
    }
    return diff;
}

function newId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return crypto.randomBytes(16).toString('hex');
}

export async function uploadImage(req, res) {
    const file = req.file;
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
        return res.status(400).json({ error: 'Image file is required (field: image).' });
    }

    if (typeof file.mimetype !== 'string' || !file.mimetype.startsWith('image/')) {
        return res.status(415).json({ error: 'Only image uploads are supported.' });
    }

    await ensureUploadsDir();

    const id = newId();
    const original = file.buffer;

    const originalSha256 = sha256Hex(original);
    const compressed = compressHuffman(original);
    const roundTrip = decompressHuffman(compressed);
    const roundTripSha256 = sha256Hex(roundTrip);

    const byteDiffCount = countByteDiff(original, roundTrip);
    const lossless = byteDiffCount === 0 && originalSha256 === roundTripSha256;

    const meta = {
        id,
        originalName: safeFilename(file.originalname),
        mimeType: file.mimetype,
        createdAt: new Date().toISOString(),
        originalSize: original.length,
        compressedSize: compressed.length,
        compression: {
            algorithm: 'huffman',
            lossless,
        },
        verification: {
            byteDiffCount,
            originalSha256,
            roundTripSha256,
            sha256Match: originalSha256 === roundTripSha256,
        },
    };

    const huffPath = path.join(uploadsDir, `${id}.huff`);
    const metaPath = path.join(uploadsDir, `${id}.json`);

    await Promise.all([
        fs.writeFile(huffPath, compressed),
        fs.writeFile(metaPath, JSON.stringify(meta)),
    ]);

    res.status(201).json({
        id,
        url: `/api/images/${id}`,
        stats: {
            originalSize: meta.originalSize,
            compressedSize: meta.compressedSize,
            compressionRatio: meta.originalSize ? meta.compressedSize / meta.originalSize : null,
            lossless: meta.compression.lossless,
            byteDiffCount: meta.verification.byteDiffCount,
            sha256Match: meta.verification.sha256Match,
        },
    });
}

export async function getImage(req, res) {
    const id = safeId(req.params?.id);
    if (!id) return res.status(400).json({ error: 'Invalid image id.' });

    const huffPath = path.join(uploadsDir, `${id}.huff`);
    const metaPath = path.join(uploadsDir, `${id}.json`);

    let compressed;
    let meta;
    try {
        const [compBuf, metaBuf] = await Promise.all([
            fs.readFile(huffPath),
            fs.readFile(metaPath),
        ]);
        compressed = compBuf;
        meta = JSON.parse(metaBuf.toString('utf8'));
    } catch {
        return res.status(404).json({ error: 'Image not found.' });
    }

    let original;
    try {
        original = decompressHuffman(compressed);
    } catch {
        return res.status(500).json({ error: 'Failed to decode stored image.' });
    }

    const filename = safeFilename(meta?.originalName || 'image');
    const mimeType = typeof meta?.mimeType === 'string' ? meta.mimeType : 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(original.length));
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(original);
}

export async function getImageStats(req, res) {
    const id = safeId(req.params?.id);
    if (!id) return res.status(400).json({ error: 'Invalid image id.' });

    const metaPath = path.join(uploadsDir, `${id}.json`);
    try {
        const metaBuf = await fs.readFile(metaPath);
        const meta = JSON.parse(metaBuf.toString('utf8'));
        res.status(200).json(meta);
    } catch {
        res.status(404).json({ error: 'Image not found.' });
    }
}

export default { uploadImage, getImage, getImageStats };
