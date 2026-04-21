// Lossless Huffman coding for arbitrary byte buffers.
// File format used by `compressHuffman()`:
//  - 4 bytes  : ASCII magic "HUF1"
//  - 4 bytes  : uint32 BE original byte length
//  - 4 bytes  : uint32 BE encoded bit length
//  - 256 bytes: code lengths for symbols 0..255 (0 means unused)
//  - N bytes  : encoded bitstream (MSB-first per byte)

function buildHuffmanTree(freqs) {
    const nodes = [];
    for (let sym = 0; sym < 256; sym++) {
        const freq = freqs[sym];
        if (freq > 0) nodes.push({ sym, freq, left: null, right: null });
    }

    if (nodes.length === 0) return null;

    // Deterministic tie-breaking: freq, then leaf-vs-internal, then symbol.
    // With only 256 symbols, repeated sorting is fine.
    while (nodes.length > 1) {
        nodes.sort((a, b) => {
            if (a.freq !== b.freq) return a.freq - b.freq;
            const aLeaf = a.left === null && a.right === null;
            const bLeaf = b.left === null && b.right === null;
            if (aLeaf !== bLeaf) return aLeaf ? -1 : 1;
            const aSym = a.sym ?? 256;
            const bSym = b.sym ?? 256;
            return aSym - bSym;
        });

        const left = nodes.shift();
        const right = nodes.shift();
        nodes.push({ sym: null, freq: left.freq + right.freq, left, right });
    }

    return nodes[0];
}

function fillCodeLengths(node, depth, lengths) {
    if (!node) return;
    const isLeaf = node.left === null && node.right === null;
    if (isLeaf) {
        // If there's only one symbol, give it a 1-bit code.
        lengths[node.sym] = Math.max(1, depth);
        return;
    }
    fillCodeLengths(node.left, depth + 1, lengths);
    fillCodeLengths(node.right, depth + 1, lengths);
}

function buildCanonicalCodesFromLengths(codeLengths) {
    const entries = [];
    for (let sym = 0; sym < 256; sym++) {
        const len = codeLengths[sym] | 0;
        if (len > 0) entries.push({ sym, len });
    }

    entries.sort((a, b) => (a.len - b.len) || (a.sym - b.sym));

    /** @type {Array<{code: bigint, len: number} | null>} */
    const codes = Array(256).fill(null);

    let code = 0n;
    let prevLen = 0;
    for (const { sym, len } of entries) {
        const shift = len - prevLen;
        if (shift < 0) {
            throw new Error('Invalid canonical Huffman lengths.');
        }
        code <<= BigInt(shift);
        codes[sym] = { code, len };
        code += 1n;
        prevLen = len;
    }

    return { codes, entries };
}

class BitWriter {
    constructor() {
        this._bytes = [];
        this._cur = 0;
        this._bitPos = 0; // 0..7
        this.bitLength = 0;
    }

    writeBit(bit) {
        if (bit) this._cur |= 1 << (7 - this._bitPos);
        this._bitPos++;
        this.bitLength++;
        if (this._bitPos === 8) {
            this._bytes.push(this._cur);
            this._cur = 0;
            this._bitPos = 0;
        }
    }

    finish() {
        if (this._bitPos !== 0) {
            this._bytes.push(this._cur);
            this._cur = 0;
            this._bitPos = 0;
        }
        return Buffer.from(this._bytes);
    }
}

export function compressHuffman(input) {
    if (!Buffer.isBuffer(input)) {
        throw new TypeError('compressHuffman expects a Buffer.');
    }

    const freqs = new Array(256).fill(0);
    for (const b of input) freqs[b]++;

    const tree = buildHuffmanTree(freqs);
    const codeLengths = new Uint8Array(256);
    if (tree) fillCodeLengths(tree, 0, codeLengths);

    const { codes } = buildCanonicalCodesFromLengths(codeLengths);

    const bw = new BitWriter();
    for (const b of input) {
        const entry = codes[b];
        if (!entry) throw new Error('Missing Huffman code for symbol.');
        const { code, len } = entry;
        for (let i = len - 1; i >= 0; i--) {
            const bit = (code >> BigInt(i)) & 1n;
            bw.writeBit(bit === 1n);
        }
    }

    const bitstream = bw.finish();

    const header = Buffer.allocUnsafe(4 + 4 + 4 + 256);
    header.write('HUF1', 0, 4, 'ascii');
    header.writeUInt32BE(input.length >>> 0, 4);
    header.writeUInt32BE(bw.bitLength >>> 0, 8);
    Buffer.from(codeLengths).copy(header, 12);

    return Buffer.concat([header, bitstream]);
}

function buildDecodeTrieFromCanonical(codeLengths) {
    const { codes, entries } = buildCanonicalCodesFromLengths(codeLengths);
    const root = { zero: null, one: null, sym: null };

    for (const { sym } of entries) {
        const { code, len } = /** @type {{code: bigint, len: number}} */ (codes[sym]);
        let node = root;
        for (let i = len - 1; i >= 0; i--) {
            const bit = ((code >> BigInt(i)) & 1n) === 1n;
            if (bit) {
                node.one ||= { zero: null, one: null, sym: null };
                node = node.one;
            } else {
                node.zero ||= { zero: null, one: null, sym: null };
                node = node.zero;
            }
        }
        node.sym = sym;
    }

    return root;
}

export function decompressHuffman(container) {
    if (!Buffer.isBuffer(container)) {
        throw new TypeError('decompressHuffman expects a Buffer.');
    }

    const minHeader = 4 + 4 + 4 + 256;
    if (container.length < minHeader) {
        throw new Error('Invalid Huffman container (too small).');
    }

    const magic = container.subarray(0, 4).toString('ascii');
    if (magic !== 'HUF1') {
        throw new Error('Invalid Huffman container (bad magic).');
    }

    const originalLen = container.readUInt32BE(4);
    const bitLen = container.readUInt32BE(8);
    const codeLengths = container.subarray(12, 12 + 256);
    const bitstream = container.subarray(minHeader);

    if (bitLen > bitstream.length * 8) {
        throw new Error('Invalid Huffman container (bit length out of range).');
    }

    if (originalLen === 0) {
        return Buffer.alloc(0);
    }

    const trie = buildDecodeTrieFromCanonical(codeLengths);

    const out = Buffer.allocUnsafe(originalLen);
    let outPos = 0;
    let node = trie;

    for (let bitIndex = 0; bitIndex < bitLen; bitIndex++) {
        const byteIndex = bitIndex >> 3;
        const innerBit = 7 - (bitIndex & 7);
        const bit = ((bitstream[byteIndex] >> innerBit) & 1) === 1;

        node = bit ? node.one : node.zero;
        if (!node) {
            throw new Error('Invalid Huffman container (decode failed).');
        }

        if (node.sym !== null) {
            out[outPos++] = node.sym;
            if (outPos === originalLen) break;
            node = trie;
        }
    }

    if (outPos !== originalLen) {
        throw new Error('Invalid Huffman container (truncated).');
    }

    return out;
}

export default { compressHuffman, decompressHuffman };
