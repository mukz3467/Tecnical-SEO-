import { inflateRawSync } from 'node:zlib';

export interface ZipFinding {
  file: string;
  issue: string;
  detail: string;
}

export function inspectWebsiteZip(zipBase64: string): {
  filesScanned: number;
  findings: ZipFinding[];
  message: string;
} {
  if (typeof zipBase64 !== 'string' || zipBase64.length > 14 * 1024 * 1024) {
    throw new Error('ZIP payload is missing or too large. Maximum compressed size is 10 MB.');
  }
  const buffer = Buffer.from(zipBase64, 'base64');
  if (buffer.length < 22 || buffer.length > 10 * 1024 * 1024) {
    throw new Error('ZIP file must be a valid archive no larger than 10 MB.');
  }

  // Find End of Central Directory. ZIP64 and encrypted archives are intentionally unsupported.
  let eocd = -1;
  const searchStart = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= searchStart; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file does not look like a valid ZIP archive.');
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  if (entries > 5000) throw new Error('ZIP contains too many entries (maximum 5,000).');

  const findings: ZipFinding[] = [];
  let filesScanned = 0;
  let totalInflated = 0;
  let htmlFound = 0;

  for (let entry = 0; entry < entries; entry++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('ZIP central directory is malformed.');
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength).replace(/\\/g, '/');
    offset += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/') || !/\.(html?|xhtml)$/i.test(name)) continue;
    htmlFound++;
    if (htmlFound > 200) throw new Error('ZIP contains more than 200 HTML files. Please upload a smaller source bundle.');
    if ((flags & 1) !== 0) continue; // Encrypted entry: skip, never attempt to decrypt.
    if (uncompressedSize > 2 * 1024 * 1024 || totalInflated + uncompressedSize > 20 * 1024 * 1024) {
      findings.push({ file: name, issue: 'File skipped: size limit', detail: 'This HTML file exceeds the per-file or total inspection size limit.' });
      continue;
    }
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataStart < 0 || dataEnd > buffer.length) continue;

    let htmlBuffer: Buffer;
    try {
      const compressed = buffer.subarray(dataStart, dataEnd);
      if (method === 0) htmlBuffer = Buffer.from(compressed);
      else if (method === 8) htmlBuffer = inflateRawSync(compressed, { maxOutputLength: 2 * 1024 * 1024 });
      else continue;
    } catch {
      continue;
    }
    totalInflated += htmlBuffer.length;
    const html = htmlBuffer.toString('utf8');
    filesScanned++;
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]?.trim() || '';
    if (!title) findings.push({ file: name, issue: 'Missing title tag', detail: 'Add a unique, descriptive <title> element to this page.' });
    const description = html.match(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["'][^"']*["'][^>]*>/i)
      || html.match(/<meta\b[^>]*content\s*=\s*["'][^"']*["'][^>]*name\s*=\s*["']description["'][^>]*>/i);
    if (!description) findings.push({ file: name, issue: 'Missing meta description', detail: 'Add a concise, page-specific meta description.' });
    if (!/<h1\b[^>]*>/i.test(html)) findings.push({ file: name, issue: 'Missing H1 heading', detail: 'Add one clear primary heading that describes the page.' });
    if (!/<link\b[^>]*rel\s*=\s*["']canonical["']/i.test(html)) findings.push({ file: name, issue: 'Canonical tag not detected', detail: 'Check whether this page needs an absolute canonical URL.' });
    if (/<meta\b[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex/i.test(html)) {
      findings.push({ file: name, issue: 'Noindex directive detected', detail: 'Verify that this page is intentionally excluded from search indexing.' });
    }
    const imgs = html.match(/<img\b[^>]*>/gi) || [];
    const missingAlt = imgs.filter(img => !/\balt\s*=\s*["'][^"']*["']/i.test(img));
    if (missingAlt.length) findings.push({ file: name, issue: 'Images missing alt attributes', detail: missingAlt.length + ' image(s) have no alt attribute.' });
  }

  if (!htmlFound) throw new Error('No HTML files were found in this ZIP. Upload a website source ZIP containing .html or .htm files.');
  return {
    filesScanned,
    findings: findings.slice(0, 500),
    message: 'Review-only source scan. Findings are based on HTML files in the uploaded archive; external site behaviour and runtime-rendered content are not checked.'
  };
}
