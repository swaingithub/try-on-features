const fs = require('fs');
const path = require('path');
const { virtualTryOn, virtualTryOnByText } = require('../services/zaiService');

// ─── Environment Detection ────────────────────────────────────────────────────

const isVercel = !!process.env.VERCEL;

/**
 * Get the base directory for saving files.
 * On Vercel, only /tmp is writable. Locally, use project uploads directory.
 */
function getSaveDir() {
  if (isVercel) {
    const dir = '/tmp/uploads/results';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  const dir = path.join(process.cwd(), 'uploads', 'results');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ─── Helper: Convert Uploaded File to Base64 Data URL ─────────────────────────

function fileToBase64DataUrl(file) {
  const buffer = fs.readFileSync(file.path);
  const base64 = buffer.toString('base64');
  const mimeType = file.mimetype || 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

// ─── Helper: Save Base64 Image to Disk ────────────────────────────────────────

function saveBase64Image(base64Data, filename) {
  // Strip data URL prefix if present
  const rawBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(rawBase64, 'base64');

  const saveDir = getSaveDir();
  const filepath = path.join(saveDir, filename);
  fs.writeFileSync(filepath, buffer);

  return filepath;
}

// ─── Helper: Clean Up Uploaded Temp Files ─────────────────────────────────────

function cleanupFiles(...filePaths) {
  for (const fp of filePaths) {
    try {
      if (fp && fs.existsSync(fp)) {
        fs.unlinkSync(fp);
      }
    } catch (_) {
      // ignore cleanup errors
    }
  }
}

// ─── Controller: Virtual Try-On (User Photo + Product Image) ──────────────────

/**
 * POST /api/tryon
 * Expects multipart form data with:
 *   - userPhoto   (file) — the person's photo
 *   - productImage (file) — the clothing/product image
 */
async function handleTryOn(req, res) {
  const userPhoto = req.files?.userPhoto?.[0];
  const productImage = req.files?.productImage?.[0];

  if (!userPhoto) {
    return res.status(400).json({
      success: false,
      error: 'userPhoto is required',
    });
  }

  if (!productImage) {
    return res.status(400).json({
      success: false,
      error: 'productImage is required. Use /api/tryon/text for text-only try-on.',
    });
  }

  try {
    console.log('[tryonController] Starting virtual try-on…');
    console.log(`[tryonController] User photo: ${userPhoto.originalname} (${userPhoto.size} bytes)`);
    console.log(`[tryonController] Product image: ${productImage.originalname} (${productImage.size} bytes)`);

    // Convert uploaded files to base64 data URLs
    const userDataUrl = fileToBase64DataUrl(userPhoto);
    const productDataUrl = fileToBase64DataUrl(productImage);

    // Run virtual try-on
    const result = await virtualTryOn(userDataUrl, productDataUrl);

    // Save result image to disk
    const timestamp = Date.now();
    const resultFilename = `tryon_${timestamp}.png`;
    const resultPath = saveBase64Image(result.imageBase64, resultFilename);

    console.log(`[tryonController] Try-on complete! Saved to: ${resultPath}`);

    // Clean up uploaded temp files
    cleanupFiles(userPhoto.path, productImage.path);

    // Build the result URL
    // On Vercel, files in /tmp are ephemeral — return base64 directly
    // Locally, you can serve from /uploads/results via Express static
    const imageUrl = isVercel
      ? `data:image/png;base64,${result.imageBase64}`
      : `/uploads/results/${resultFilename}`;

    res.json({
      success: true,
      imageUrl,
      imageBase64: result.imageBase64,
      analysis: result.analysis,
      analysisMethod: result.analysisMethod,
      prompt: result.prompt,
      filename: resultFilename,
    });
  } catch (error) {
    console.error('[tryonController] Try-on error:', error);

    // Clean up uploaded files even on error
    cleanupFiles(userPhoto?.path, productImage?.path);

    res.status(500).json({
      success: false,
      error: error.message || 'Virtual try-on failed',
    });
  }
}

// ─── Controller: Text-Based Try-On (User Photo + Text Prompt) ─────────────────

/**
 * POST /api/tryon/text
 * Expects multipart form data with:
 *   - userPhoto (file) — the person's photo
 *   - prompt    (text) — text description of the outfit
 */
async function handleTryOnByText(req, res) {
  const userPhoto = req.file;
  const textPrompt = req.body.prompt;

  if (!userPhoto) {
    return res.status(400).json({
      success: false,
      error: 'userPhoto is required',
    });
  }

  if (!textPrompt || textPrompt.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'prompt text is required',
    });
  }

  try {
    console.log('[tryonController] Starting text-based try-on…');
    console.log(`[tryonController] User photo: ${userPhoto.originalname} (${userPhoto.size} bytes)`);
    console.log(`[tryonController] Prompt: ${textPrompt.substring(0, 100)}…`);

    // Convert uploaded file to base64 data URL
    const userDataUrl = fileToBase64DataUrl(userPhoto);

    // Run text-based virtual try-on
    const result = await virtualTryOnByText(userDataUrl, textPrompt.trim());

    // Save result image
    const timestamp = Date.now();
    const resultFilename = `tryon_text_${timestamp}.png`;
    const resultPath = saveBase64Image(result.imageBase64, resultFilename);

    console.log(`[tryonController] Text try-on complete! Saved to: ${resultPath}`);

    // Clean up
    cleanupFiles(userPhoto.path);

    const imageUrl = isVercel
      ? `data:image/png;base64,${result.imageBase64}`
      : `/uploads/results/${resultFilename}`;

    res.json({
      success: true,
      imageUrl,
      imageBase64: result.imageBase64,
      analysis: result.analysis,
      analysisMethod: result.analysisMethod,
      prompt: result.prompt,
      filename: resultFilename,
    });
  } catch (error) {
    console.error('[tryonController] Text try-on error:', error);
    cleanupFiles(userPhoto?.path);

    res.status(500).json({
      success: false,
      error: error.message || 'Text-based virtual try-on failed',
    });
  }
}

// ─── Controller: Outfit Generation (No Uploads) ──────────────────────────────

/**
 * POST /api/outfit/generate
 * Body: { prompt: string }
 * Generates an outfit image from a text prompt only (no user photo).
 */
async function handleOutfitGenerate(req, res) {
  const { prompt } = req.body;

  if (!prompt || prompt.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'prompt is required',
    });
  }

  try {
    console.log('[tryonController] Generating outfit from prompt…');

    const { generateTryOnImage } = require('../services/zaiService');
    const imageBase64 = await generateTryOnImage(
      `Fashion outfit design: ${prompt.trim()}. Photorealistic, studio lighting, high detail, professional fashion photography.`
    );

    const timestamp = Date.now();
    const resultFilename = `outfit_${timestamp}.png`;
    const resultPath = saveBase64Image(imageBase64, resultFilename);

    const imageUrl = isVercel
      ? `data:image/png;base64,${imageBase64}`
      : `/uploads/results/${resultFilename}`;

    res.json({
      success: true,
      imageUrl,
      imageBase64,
      prompt,
      filename: resultFilename,
    });
  } catch (error) {
    console.error('[tryonController] Outfit generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Outfit generation failed',
    });
  }
}

// ─── Controller: Analyze User Photo Only ──────────────────────────────────────

/**
 * POST /api/analyze
 * Expects multipart form data with:
 *   - userPhoto (file) — the person's photo
 * Returns analysis without generating an image.
 */
async function handleAnalyze(req, res) {
  const userPhoto = req.file;

  if (!userPhoto) {
    return res.status(400).json({
      success: false,
      error: 'userPhoto is required',
    });
  }

  try {
    console.log('[tryonController] Analyzing user photo…');

    const { analyzeUserPhoto } = require('../services/zaiService');
    const userDataUrl = fileToBase64DataUrl(userPhoto);
    const analysis = await analyzeUserPhoto(userDataUrl);

    cleanupFiles(userPhoto.path);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('[tryonController] Analysis error:', error);
    cleanupFiles(userPhoto?.path);

    res.status(500).json({
      success: false,
      error: error.message || 'Photo analysis failed',
    });
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  handleTryOn,
  handleTryOnByText,
  handleOutfitGenerate,
  handleAnalyze,
};
