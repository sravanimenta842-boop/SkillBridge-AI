'use strict';
/**
 * Text extraction from uploaded resumes: PDF (via pdfjs-dist), DOCX (built-in
 * zip reader – no dependency) and plain text.
 */
const zlib = require('zlib');
const { HttpError } = require('./http');

/* ---------- DOCX: minimal ZIP reader ---------- */
function readZipEntry(buf, wanted) {
  // locate End Of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: 30 * 1024 * 1024 });
      throw new Error('unsupported compression');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const decodeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&');

function docxToText(buf) {
  const xml = readZipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('word/document.xml missing');
  let s = xml.toString('utf8');
  s = s.replace(/<w:tab\/>/g, '\t').replace(/<w:(br|cr)\b[^>]*\/>/g, '\n')
    .replace(/<\/w:tc>/g, ' | ').replace(/<\/w:p>/g, '\n');
  s = s.replace(/<[^>]+>/g, '');
  return decodeXml(s).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- PDF ---------- */
async function pdfToText(buf) {
  let pdfjs;
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    throw new HttpError(501, 'PDF support is not installed on the server. Run "npm install" in the project folder, or upload a DOCX/TXT file instead.');
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  let out = '';
  const pages = Math.min(doc.numPages, 8);
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY = null;
    for (const it of content.items) {
      if (lastY !== null && Math.abs(it.transform[5] - lastY) > 2) out += '\n';
      out += it.str;
      lastY = it.transform[5];
      if (it.hasEOL) out += '\n';
    }
    out += '\n\n';
  }
  await doc.destroy();
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Detects the type from magic bytes + extension and returns clean text. */
async function extractText(buf, filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  let text;
  try {
    if (buf.subarray(0, 5).toString('latin1') === '%PDF-') {
      text = await pdfToText(buf);
    } else if (buf[0] === 0x50 && buf[1] === 0x4b) {
      if (ext && ext !== 'docx') throw new HttpError(415, 'Only .docx Word files are supported (not .doc, .xlsx or .pptx).');
      text = docxToText(buf);
    } else if (['txt', 'md', 'text', ''].includes(ext)) {
      text = buf.toString('utf8');
    } else if (ext === 'doc') {
      throw new HttpError(415, 'Old .doc files are not supported. Save the file as .docx or PDF and upload again.');
    } else {
      throw new HttpError(415, 'Unsupported file type. Upload a PDF, DOCX or TXT resume.');
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, 'That file could not be read. It may be damaged or password-protected.');
  }
  text = text.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
  if (text.length < 60) {
    throw new HttpError(422, 'No readable text was found in that file (scanned images are not supported). Upload a text-based PDF/DOCX, or paste your resume text instead.');
  }
  return text.slice(0, 30000);
}

module.exports = { extractText };
