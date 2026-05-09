import { virtualTryOn, virtualTryOnByText, generateOutfitImage, analyzeBodyType } from '../services/zaiService.js';
import { fileToBase64DataUrl, saveBase64Image, getMimeType } from '../utils/imageUtils.js';
import path from 'path';

/**
 * POST /api/tryon
 * Full try-on: User photo + Product image → Fusion result
 * Files: userPhoto + productImage (both multipart uploads)
 * Body: { size?: "768x1344" }
 */
export async function handleTryOn(req, res) {
  try {
    if (!req.files) {
      return res.status(400).json({ error: 'Both userPhoto and productImage are required' });
    }

    const userPhoto = req.files.userPhoto?.[0];
    const productImage = req.files.productImage?.[0];

    if (!userPhoto) {
      return res.status(400).json({ error: 'User photo (userPhoto) is required' });
    }
    if (!productImage) {
      return res.status(400).json({ error: 'Product image (productImage) is required' });
    }

    const { size = '768x1344' } = req.body;

    // Convert uploaded files to base64
    const userImageBase64 = fileToBase64DataUrl(userPhoto.path, getMimeType(userPhoto.originalname));
    const productImageBase64 = fileToBase64DataUrl(productImage.path, getMimeType(productImage.originalname));

    // Call the fusion try-on
    const result = await virtualTryOn(userImageBase64, productImageBase64, size);

    // Save result
    const resultFilename = `tryon-${Date.now()}.png`;
    const outputDir = path.join(process.cwd(), 'uploads', 'results');
    saveBase64Image(result.resultImage, outputDir, resultFilename);

    res.json({
      success: true,
      resultImage: `data:image/png;base64,${result.resultImage}`,
      resultUrl: `/results/${resultFilename}`,
      userDescription: result.userDescription,
      productDescription: result.productDescription,
      combinedDescription: result.combinedDescription,
    });

  } catch (error) {
    console.error('Try-on error:', error);
    res.status(500).json({ error: 'Failed to generate try-on image', details: error.message });
  }
}

/**
 * POST /api/tryon/text
 * Text-based try-on: User photo + outfit text description
 * File: userPhoto (multipart upload)
 * Body: { prompt: "red evening gown", size?: "768x1344" }
 */
export async function handleTryOnByText(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'User photo is required' });
    }

    const { prompt, size = '768x1344' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Outfit description prompt is required' });
    }

    const userImageBase64 = fileToBase64DataUrl(req.file.path, getMimeType(req.file.originalname));

    const result = await virtualTryOnByText(userImageBase64, prompt, size);

    const resultFilename = `tryon-text-${Date.now()}.png`;
    const outputDir = path.join(process.cwd(), 'uploads', 'results');
    saveBase64Image(result.resultImage, outputDir, resultFilename);

    res.json({
      success: true,
      resultImage: `data:image/png;base64,${result.resultImage}`,
      resultUrl: `/results/${resultFilename}`,
      userDescription: result.userDescription,
    });

  } catch (error) {
    console.error('Try-on text error:', error);
    res.status(500).json({ error: 'Failed to generate try-on image', details: error.message });
  }
}

/**
 * POST /api/outfit/generate
 * Body: { prompt: "elegant black dress" }
 */
export async function handleGenerateOutfit(req, res) {
  try {
    const { prompt, size = '768x1344' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Outfit description prompt is required' });
    }

    const resultBase64 = await generateOutfitImage(prompt);

    res.json({
      success: true,
      outfitImage: `data:image/png;base64,${resultBase64}`,
    });

  } catch (error) {
    console.error('Outfit generation error:', error);
    res.status(500).json({ error: 'Failed to generate outfit image', details: error.message });
  }
}

/**
 * POST /api/analyze
 * File: userPhoto (multipart upload)
 */
export async function handleAnalyze(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'User photo is required' });
    }

    const mimeType = getMimeType(req.file.originalname);
    const imageBase64 = fileToBase64DataUrl(req.file.path, mimeType);

    const analysis = await analyzeBodyType(imageBase64);

    res.json({
      success: true,
      analysis,
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze image', details: error.message });
  }
}