import fs from 'fs';
import path from 'path';

/**
 * Convert a local file to base64 data URL
 */
export function fileToBase64DataUrl(filePath, mimeType = 'image/jpeg') {
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Save base64 image to disk
 * @returns {string} Saved file path
 */
export function saveBase64Image(base64Data, outputDir, filename) {
  // Remove data URL prefix if present
  const pureBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(pureBase64, 'base64');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  return mimeMap[ext] || 'image/jpeg';
}