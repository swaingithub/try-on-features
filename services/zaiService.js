const ZAI = require('z-ai-web-dev-sdk');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Configuration ────────────────────────────────────────────────────────────

function getConfig() {
  // Priority 1: Environment variables (Vercel / production)
  if (process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY) {
    return {
      baseUrl: process.env.ZAI_BASE_URL,
      apiKey: process.env.ZAI_API_KEY,
    };
  }

  // Priority 2: .z-ai-config file (local development)
  const configPaths = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(raw);
        if (config.baseUrl && config.apiKey) {
          return config;
        }
      }
    } catch (_) {
      // skip invalid files
    }
  }

  throw new Error(
    'Configuration not found. Set ZAI_BASE_URL + ZAI_API_KEY env vars, or create .z-ai-config file.'
  );
}

// ─── ZAI Instance with Vercel Fix ─────────────────────────────────────────────

/**
 * Creates a ZAI SDK instance that works both locally AND on Vercel.
 *
 * On Vercel there is no persistent filesystem, so ZAI.create() cannot find
 * .z-ai-config.  We fix this by writing the config from env vars into /tmp
 * BEFORE calling ZAI.create(), so the SDK discovers it in its search paths.
 */
let _zaiInstance = null;

async function getZAI() {
  if (_zaiInstance) return _zaiInstance;

  const config = getConfig();

  // ── Vercel fix: write temp config file so SDK can find it ──
  const isVercel = !!process.env.VERCEL; // Vercel sets this automatically
  const tmpConfigPath = '/tmp/.z-ai-config';

  if (isVercel || !fs.existsSync(tmpConfigPath)) {
    try {
      fs.writeFileSync(tmpConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log('[zaiService] Wrote temp config to', tmpConfigPath);
    } catch (err) {
      console.warn('[zaiService] Could not write temp config:', err.message);
    }
  }

  // The SDK searches: cwd → home → /etc.  On Vercel cwd is /vercel/path,
  // home may not be writable, and /etc is read-only.  The trick is to
  // point the SDK at /tmp by temporarily changing cwd during create().
  const originalCwd = process.cwd();

  try {
    // Try creating with the current working directory first
    _zaiInstance = await ZAI.create();
  } catch (err1) {
    console.warn('[zaiService] ZAI.create() with default cwd failed:', err1.message);

    // Fallback: change cwd to /tmp where we wrote the config, then create
    try {
      process.chdir('/tmp');
      _zaiInstance = await ZAI.create();
    } catch (err2) {
      console.error('[zaiService] ZAI.create() with /tmp cwd also failed:', err2.message);

      // Final fallback: directly use fetch-based calls (no SDK instance needed)
      console.log('[zaiService] Will use raw fetch() for all API calls');
      _zaiInstance = null;
    } finally {
      // Always restore original cwd
      process.chdir(originalCwd);
    }
  }

  return _zaiInstance;
}

// ─── Raw Fetch Helper (works without SDK instance) ────────────────────────────

/**
 * Makes a raw API call to BigModel.  Used as fallback when ZAI.create()
 * fails entirely, or when the SDK doesn't support an endpoint.
 */
async function rawFetch(endpoint, body) {
  const config = getConfig();
  const url = `${config.baseUrl}${endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BigModel API ${response.status}: ${errorText}`);
  }

  return response.json();
}

// ─── Retry Utility ────────────────────────────────────────────────────────────

async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 =
        err?.response?.status === 429 ||
        err?.status === 429 ||
        (err?.message && err.message.includes('429')) ||
        (err?.message && err.message.includes('1305'));

      if (is429 && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(`[zaiService] Rate limited (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms…`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

// ─── Image Analysis (Vision) ──────────────────────────────────────────────────

/**
 * Analyze a single image using the vision model.
 * Works with both SDK instance and raw fetch fallback.
 */
async function analyzeImageWithVision(imageDataUrl, prompt) {
  const config = getConfig();
  const zai = await getZAI();

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: { url: imageDataUrl },
        },
      ],
    },
  ];

  // Try SDK first
  if (zai) {
    try {
      const result = await retryWithBackoff(async () => {
        const completion = await zai.chat.completions.create({
          model: 'glm-4.6v-flash',
          messages,
          max_tokens: 1024,
          temperature: 0.7,
        });
        return completion.choices?.[0]?.message?.content || '';
      });
      return result;
    } catch (sdkErr) {
      console.warn('[zaiService] SDK vision call failed, trying raw fetch:', sdkErr.message);
    }
  }

  // Fallback: raw fetch
  return retryWithBackoff(async () => {
    const result = await rawFetch('/chat/completions', {
      model: 'glm-4.6v-flash',
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    });
    return result.choices?.[0]?.message?.content || '';
  });
}

/**
 * Analyze the user's uploaded photo — body type, skin tone, pose, etc.
 */
async function analyzeUserPhoto(imageDataUrl) {
  const prompt = `Analyze this person's photo for a virtual try-on experience. Describe in detail:
1. Body type and build (slim, average, athletic, curvy, etc.)
2. Approximate height estimation based on proportions
3. Skin tone (fair, medium, olive, dark, etc.)
4. Current pose and posture (standing, sitting, facing direction)
5. Any visible accessories or existing clothing style
6. Best clothing fit recommendations for this body type

Be specific and descriptive to help generate an accurate try-on image.`;

  return analyzeImageWithVision(imageDataUrl, prompt);
}

/**
 * Analyze the product/clothing image — style, color, fit, etc.
 */
async function analyzeProductImage(imageDataUrl) {
  const prompt = `Analyze this clothing/fashion product image in detail for virtual try-on:
1. Type of garment (dress, shirt, jacket, pants, etc.)
2. Color and pattern (solid, striped, floral, etc.)
3. Fabric type and texture appearance (silk, cotton, denim, leather, etc.)
4. Fit and cut (slim fit, regular, oversized, A-line, etc.)
5. Length (crop, waist, knee, ankle, floor-length)
6. Notable design details (buttons, zippers, embroidery, pockets, etc.)
7. Style category (casual, formal, streetwear, ethnic, sportswear, etc.)
8. Season suitability (summer, winter, all-season)

Be specific so the try-on image looks accurate.`;

  return analyzeImageWithVision(imageDataUrl, prompt);
}

/**
 * Analyze BOTH images together in a single vision request — the most
 * effective approach because the model can see the person AND the product
 * at the same time.
 */
async function analyzeBothImages(userImageDataUrl, productImageDataUrl) {
  const prompt = `You are an AI fashion assistant. Analyze BOTH images together for a virtual try-on:

IMAGE 1: The person who will wear the outfit.
IMAGE 2: The clothing product to be tried on.

Provide:
1. Person's body type, build, and skin tone
2. Product type, color, pattern, and fabric
3. How well this product suits the person's body type
4. Suggested styling adjustments (tucking in, rolling sleeves, etc.)
5. A vivid, detailed description of how the person would look wearing this product — as if describing a photograph

Be highly specific and visual. This description will be used to generate a try-on image.`;

  const config = getConfig();
  const zai = await getZAI();

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: { url: userImageDataUrl },
        },
        {
          type: 'image_url',
          image_url: { url: productImageDataUrl },
        },
      ],
    },
  ];

  // Try SDK first
  if (zai) {
    try {
      const result = await retryWithBackoff(async () => {
        const completion = await zai.chat.completions.create({
          model: 'glm-4.6v-flash',
          messages,
          max_tokens: 1500,
          temperature: 0.7,
        });
        return completion.choices?.[0]?.message?.content || '';
      });
      return result;
    } catch (sdkErr) {
      console.warn('[zaiService] SDK dual-vision call failed, trying raw fetch:', sdkErr.message);
    }
  }

  // Fallback: raw fetch
  return retryWithBackoff(async () => {
    const result = await rawFetch('/chat/completions', {
      model: 'glm-4.6v-flash',
      messages,
      max_tokens: 1500,
      temperature: 0.7,
    });
    return result.choices?.[0]?.message?.content || '';
  });
}

// ─── Image Generation ─────────────────────────────────────────────────────────

/**
 * Generate try-on image using Pollinations.ai (FREE, no API key required).
 * Uses a simple GET request that returns an image directly.
 */
async function generateImagePollinations(prompt) {
  // Pollinations has a URL length limit — truncate if needed
  const maxPromptLen = 800;
  const truncatedPrompt = prompt.length > maxPromptLen
    ? prompt.substring(0, maxPromptLen)
    : prompt;

  const encodedPrompt = encodeURIComponent(truncatedPrompt);

  // Multiple model options for Pollinations
  const models = ['flux', 'turbo'];
  const widths = [768, 1024];
  const height = 1344; // portrait orientation for try-on

  for (const model of models) {
    for (const width of widths) {
      const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${model}&nologo=true&seed=${Date.now()}`;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[zaiService] Pollinations.ai attempt ${attempt} (model=${model}, ${width}x${height})`);

          const response = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(60000), // 60s timeout
          });

          if (!response.ok) {
            throw new Error(`Pollinations HTTP ${response.status}`);
          }

          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('image')) {
            throw new Error(`Pollinations returned non-image: ${contentType}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          if (buffer.length < 5000) {
            throw new Error(`Image too small (${buffer.length} bytes), likely an error page`);
          }

          console.log(`[zaiService] Pollinations success! Image size: ${buffer.length} bytes`);
          return buffer.toString('base64');
        } catch (err) {
          console.warn(`[zaiService] Pollinations attempt ${attempt} failed:`, err.message);
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 2000 * attempt));
          }
        }
      }
    }
  }

  throw new Error('All Pollinations.ai attempts failed');
}

/**
 * Generate try-on image using BigModel CogView (PAID, requires balance).
 * Uses raw fetch() because the SDK crashes on async task responses.
 */
async function generateImageBigModel(prompt) {
  const config = getConfig();

  // Step 1: Submit image generation task
  console.log('[zaiService] Submitting BigModel image generation task…');

  const submitResponse = await fetch(`${config.baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: 'cogView-4-250304', // NOTE: camelCase V is required!
      prompt: prompt,
      size: '768x1344',
    }),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    throw new Error(`BigModel image submit ${submitResponse.status}: ${errorText}`);
  }

  const submitData = await submitResponse.json();
  const taskId = submitData.id;

  if (!taskId) {
    // Some responses return images directly (synchronous mode)
    if (submitData.data?.[0]?.url) {
      const imgResp = await fetch(submitData.data[0].url);
      const buffer = Buffer.from(await imgResp.arrayBuffer());
      return buffer.toString('base64');
    }
    if (submitData.data?.[0]?.b64_json) {
      return submitData.data[0].b64_json;
    }
    throw new Error('No task ID or image data in BigModel response');
  }

  // Step 2: Poll for completion (async mode)
  console.log(`[zaiService] Task ID: ${taskId}, polling for result…`);

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000)); // wait 2s between polls

    const pollResponse = await fetch(`${config.baseUrl}/images/generations/${taskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    if (!pollResponse.ok) {
      console.warn(`[zaiService] Poll ${i + 1} returned ${pollResponse.status}`);
      continue;
    }

    const pollData = await pollResponse.json();
    const taskStatus = pollData.task_status || pollData.status;

    if (taskStatus === 'SUCCESS' || taskStatus === 'SUCCEEDED') {
      const imageUrl = pollData.data?.[0]?.url;
      const b64 = pollData.data?.[0]?.b64_json;

      if (b64) return b64;

      if (imageUrl) {
        const imgResp = await fetch(imageUrl);
        const buffer = Buffer.from(await imgResp.arrayBuffer());
        return buffer.toString('base64');
      }

      throw new Error('BigModel task succeeded but no image in response');
    }

    if (taskStatus === 'FAIL' || taskStatus === 'FAILED') {
      throw new Error(`BigModel task failed: ${JSON.stringify(pollData)}`);
    }

    console.log(`[zaiService] Poll ${i + 1}: status=${taskStatus}`);
  }

  throw new Error('BigModel image generation timed out after 60s');
}

/**
 * Generate try-on image — tries Pollinations.ai first (free), then
 * BigModel CogView (paid) as fallback.
 */
async function generateTryOnImage(prompt) {
  // Try Pollinations.ai first (free, no API key)
  try {
    console.log('[zaiService] Trying Pollinations.ai for image generation…');
    return await generateImagePollinations(prompt);
  } catch (pollinationsErr) {
    console.warn('[zaiService] Pollinations.ai failed:', pollinationsErr.message);
  }

  // Fallback: BigModel CogView (requires account balance)
  try {
    console.log('[zaiService] Trying BigModel CogView for image generation…');
    return await generateImageBigModel(prompt);
  } catch (bigModelErr) {
    console.warn('[zaiService] BigModel CogView failed:', bigModelErr.message);
  }

  throw new Error('All image generation services failed. Please try again later.');
}

// ─── Main Try-On Functions ────────────────────────────────────────────────────

/**
 * Virtual Try-On: user photo + product image → AI fusion image.
 *
 * Flow:
 *  1. Try combined analysis (both images in one vision call)
 *  2. Fallback: individual analysis of each image
 *  3. Build detailed fusion prompt from analysis
 *  4. Generate try-on image using available services
 */
async function virtualTryOn(userImageDataUrl, productImageDataUrl) {
  let userAnalysis = '';
  let productAnalysis = '';
  let combinedAnalysis = '';
  let analysisMethod = 'none';

  // Step 1: Try combined analysis (most effective)
  try {
    console.log('[zaiService] Attempting combined dual-image analysis…');
    combinedAnalysis = await analyzeBothImages(userImageDataUrl, productImageDataUrl);
    analysisMethod = 'combined';
    console.log('[zaiService] Combined analysis successful');
  } catch (err) {
    console.warn('[zaiService] Combined analysis failed:', err.message);
  }

  // Step 2: If combined failed, try individual analyses
  if (!combinedAnalysis) {
    console.log('[zaiService] Trying individual image analyses…');

    try {
      userAnalysis = await analyzeUserPhoto(userImageDataUrl);
    } catch (err) {
      console.warn('[zaiService] User photo analysis failed:', err.message);
      userAnalysis = 'A person with average build and medium skin tone, standing straight facing the camera.';
    }

    try {
      productAnalysis = await analyzeProductImage(productImageDataUrl);
    } catch (err) {
      console.warn('[zaiService] Product image analysis failed:', err.message);
      productAnalysis = 'A fashionable clothing item with modern design.';
    }

    analysisMethod = 'individual';
  }

  // Step 3: Build the fusion prompt
  let fusionPrompt;

  if (combinedAnalysis) {
    fusionPrompt = `Photorealistic full-body virtual try-on photo: ${combinedAnalysis}. The person is wearing the described outfit perfectly. Natural lighting, studio quality, fashion photography style, high detail, the clothing fits naturally on the body, realistic fabric draping and shadows.`;
  } else {
    fusionPrompt = `Photorealistic full-body virtual try-on photo of a person with the following characteristics: ${userAnalysis}. They are wearing this outfit: ${productAnalysis}. The clothing fits naturally on their body with realistic fabric draping. Natural lighting, studio quality fashion photography, high detail, professional model pose.`;
  }

  console.log(`[zaiService] Fusion prompt (${analysisMethod} analysis): ${fusionPrompt.substring(0, 200)}…`);

  // Step 4: Generate the try-on image
  const imageBase64 = await generateTryOnImage(fusionPrompt);

  return {
    imageBase64,
    analysis: combinedAnalysis || `USER: ${userAnalysis}\nPRODUCT: ${productAnalysis}`,
    analysisMethod,
    prompt: fusionPrompt,
  };
}

/**
 * Text-only try-on: user photo + text description → AI fusion image.
 * Used when no product image is available.
 */
async function virtualTryOnByText(userImageDataUrl, textPrompt) {
  let userAnalysis = '';

  try {
    userAnalysis = await analyzeUserPhoto(userImageDataUrl);
  } catch (err) {
    console.warn('[zaiService] User photo analysis failed:', err.message);
    userAnalysis = 'A person with average build and medium skin tone, standing straight.';
  }

  const fusionPrompt = `Photorealistic full-body virtual try-on photo of a person with the following characteristics: ${userAnalysis}. They are wearing: ${textPrompt}. The clothing fits naturally with realistic fabric draping and shadows. Natural lighting, studio quality fashion photography, high detail, professional model pose.`;

  console.log(`[zaiService] Text try-on prompt: ${fusionPrompt.substring(0, 200)}…`);

  const imageBase64 = await generateTryOnImage(fusionPrompt);

  return {
    imageBase64,
    analysis: userAnalysis,
    analysisMethod: 'text-only',
    prompt: fusionPrompt,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  virtualTryOn,
  virtualTryOnByText,
  analyzeUserPhoto,
  analyzeProductImage,
  generateTryOnImage,
};
