import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

let zaiInstance = null;
let zaiConfig = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

function getConfig() {
  if (zaiConfig) return zaiConfig;
  const configPaths = [
    '.z-ai-config',
    `${process.env.HOME || process.env.USERPROFILE}/.z-ai-config`,
    '/etc/.z-ai-config'
  ];
  for (const p of configPaths) {
    if (fs.existsSync(p)) {
      zaiConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
      return zaiConfig;
    }
  }
  throw new Error('.z-ai-config not found');
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 3000) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error.message && (
        error.message.includes('1305') ||
        error.message.includes('访问量过大') ||
        error.message.includes('429') ||
        error.message.includes('rate')
      )) {
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.log(`⏳ Traffic overload. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
          await sleep(delay);
          continue;
        }
      }
      throw error;
    }
  }
  throw lastError;
}

/* ================================================================
   STEP 1A: ANALYZE USER PHOTO (body type, pose, skin tone)
   ================================================================ */

async function analyzeUserPhoto(imageBase64) {
  const zai = await getZAI();
  try {
    const result = await retryWithBackoff(async () => {
      const response = await zai.chat.completions.create({
        model: 'glm-4.6v-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this person's physical appearance for a virtual clothing try-on. Describe ONLY:
1. Body type and build (slim, average, athletic, curvy, plus-size, etc.)
2. Estimated height (tall, average, short)
3. Skin tone (fair, light, medium, olive, tan, brown, dark)
4. Current pose and facing direction (standing front, side pose, sitting, etc.)
5. Hair length, style, and color
6. Any distinctive features (beard, glasses, etc.)

Output ONLY the factual description, no suggestions or commentary.`
              },
              {
                type: 'image_url',
                image_url: { url: imageBase64 }
              }
            ]
          }
        ]
      });
      return response.choices[0].message.content;
    }, 3, 3000);

    console.log('✅ User photo analysis succeeded!');
    return result;

  } catch (error) {
    console.log('⚠️ User photo analysis failed:', error.message);
    return null;
  }
}

/* ================================================================
   STEP 1B: ANALYZE PRODUCT IMAGE (clothing details, style, fabric)
   ================================================================ */

async function analyzeProductImage(imageBase64) {
  const zai = await getZAI();
  try {
    const result = await retryWithBackoff(async () => {
      const response = await zai.chat.completions.create({
        model: 'glm-4.6v-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this clothing/fashion product image in detail for a virtual try-on. Describe ONLY:
1. Garment type (dress, shirt, jacket, pants, skirt, suit, etc.)
2. Exact color(s) and color patterns
3. Fabric texture and material (silk, cotton, denim, leather, linen, etc.)
4. Fit and silhouette (fitted, loose, A-line, straight, oversized, etc.)
5. Key design details (collar type, sleeves, buttons, zippers, pockets, embroidery, prints, etc.)
6. Length (mini, knee-length, midi, maxi, floor-length for dresses/skirts; short/long for tops)
7. Style category (casual, formal, business, streetwear, ethnic, sportswear, etc.)
8. Any visible branding, logos, or text on the garment

Output ONLY the detailed clothing description, no suggestions.`
              },
              {
                type: 'image_url',
                image_url: { url: imageBase64 }
              }
            ]
          }
        ]
      });
      return response.choices[0].message.content;
    }, 3, 3000);

    console.log('✅ Product image analysis succeeded!');
    return result;

  } catch (error) {
    console.log('⚠️ Product image analysis failed:', error.message);
    return null;
  }
}

/* ================================================================
   STEP 1C: ANALYZE BOTH IMAGES TOGETHER (advanced fusion analysis)
   ================================================================ */

async function analyzeBothImages(userImageBase64, productImageBase64) {
  const zai = await getZAI();
  try {
    const result = await retryWithBackoff(async () => {
      const response = await zai.chat.completions.create({
        model: 'glm-4.6v-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `I have TWO images:
- Image 1: A person's photo
- Image 2: A clothing product image

Analyze BOTH images together and provide a detailed description for generating a virtual try-on result. Describe:

1. PERSON: Body type, build, height estimate, skin tone, pose, hair style/color
2. CLOTHING: Garment type, exact colors, fabric, fit, design details, length, style
3. FIT ASSESSMENT: How this specific clothing would look on this specific person (consider body type, proportions)
4. STYLING NOTES: Any adjustments needed (tucking, rolling sleeves, belt needed, etc.)

Output a single detailed paragraph that combines all this information. Be specific about colors, fabrics, and how the garment drapes on the body.`
              },
              {
                type: 'image_url',
                image_url: { url: userImageBase64 }
              },
              {
                type: 'image_url',
                image_url: { url: productImageBase64 }
              }
            ]
          }
        ]
      });
      return response.choices[0].message.content;
    }, 3, 3000);

    console.log('✅ Combined image analysis succeeded!');
    return result;

  } catch (error) {
    console.log('⚠️ Combined analysis failed:', error.message);
    return null;
  }
}

/* ================================================================
   STEP 2: IMAGE GENERATION
   Priority: 1. Pollinations.ai (FREE)  2. BigModel (PAID fallback)
   ================================================================ */

async function generateTryOnImage(prompt, size = '768x1344') {
  try {
    console.log('🎨 Generating image via Pollinations.ai (FREE)...');
    const base64 = await generateImagePollinations(prompt, size);
    console.log('✅ Pollinations.ai image generated!');
    return base64;
  } catch (error) {
    console.log('⚠️ Pollinations.ai failed:', error.message);
  }

  try {
    console.log('💰 Trying BigModel (cogView-4-250304)...');
    const base64 = await generateImageBigModel(prompt, size);
    console.log('✅ BigModel image generated!');
    return base64;
  } catch (error) {
    console.log('❌ BigModel failed:', error.message);
    throw new Error(
      'Image generation failed. Both methods failed.\n' +
      '1. Wait a few minutes and retry\n' +
      '2. Add balance at https://open.bigmodel.cn for BigModel access'
    );
  }
}

async function generateImagePollinations(prompt, size = '768x1344') {
  const [width, height] = size.split('x').map(Number);
  const shortPrompt = prompt.substring(0, 200);
  const enhancedPrompt = `${shortPrompt}, professional photo, high quality, realistic`;
  const encodedPrompt = encodeURIComponent(enhancedPrompt);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const seed = Date.now() + attempt;
      const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`;

      console.log(`📤 Pollinations attempt ${attempt + 1}/3...`);

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'image/*' },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        console.log(`⚠️ Status ${response.status}, retrying...`);
        await sleep(2000);
        continue;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('image')) {
        console.log(`⚠️ Not image (${contentType}), retrying...`);
        await sleep(2000);
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength < 1000) {
        console.log(`⚠️ Too small (${arrayBuffer.byteLength} bytes), retrying...`);
        await sleep(2000);
        continue;
      }

      return Buffer.from(arrayBuffer).toString('base64');

    } catch (error) {
      console.log(`⚠️ Attempt ${attempt + 1} failed: ${error.message}`);
      if (attempt < 2) await sleep(3000);
    }
  }

  throw new Error('Pollinations.ai failed after 3 attempts');
}

async function generateImageBigModel(prompt, size = '768x1344') {
  const config = getConfig();
  const url = `${config.baseUrl}/images/generations`;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
    'X-Z-AI-From': 'Z',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'cogView-4-250304',
      prompt: prompt,
      size: size
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`BigModel failed (${response.status}): ${errorBody}`);
  }

  const result = await response.json();
  console.log('📥 BigModel response:', JSON.stringify(result).substring(0, 200));

  if (result.data && Array.isArray(result.data)) {
    return await extractBase64FromData(result.data);
  }

  if (result.id) {
    console.log(`⏳ Async task: ${result.id}`);
    return await pollBigModelResult(result.id);
  }

  throw new Error(`Unexpected response: ${JSON.stringify(result).substring(0, 200)}`);
}

async function extractBase64FromData(dataArray) {
  for (const item of dataArray) {
    if (item.base64) return item.base64;
    if (item.url) {
      console.log('📥 Downloading image from URL...');
      const imgResponse = await fetch(item.url);
      if (!imgResponse.ok) throw new Error(`Download failed: ${imgResponse.status}`);
      return Buffer.from(await imgResponse.arrayBuffer()).toString('base64');
    }
  }
  throw new Error('No image data in response');
}

async function pollBigModelResult(taskId, maxAttempts = 30, interval = 5000) {
  const config = getConfig();
  const url = `${config.baseUrl}/async-result?id=${encodeURIComponent(taskId)}`;
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'X-Z-AI-From': 'Z',
  };

  for (let i = 0; i < maxAttempts; i++) {
    console.log(`🔄 Polling ${i + 1}/${maxAttempts}...`);
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Poll failed: ${response.status}`);

    const result = await response.json();
    console.log(`   Status: ${result.task_status || 'unknown'}`);

    if (result.task_status === 'SUCCESS' || result.task_status === 'SUCCEEDED') {
      if (result.data) return await extractBase64FromData(result.data);
      if (result.video_result) return await extractBase64FromData(result.video_result);

      const imgUrl = result.url || result.video_url || result.image_url;
      if (imgUrl) {
        const imgResponse = await fetch(imgUrl);
        return Buffer.from(await imgResponse.arrayBuffer()).toString('base64');
      }

      throw new Error(`Task done but no image: ${JSON.stringify(result).substring(0, 300)}`);
    }

    if (result.task_status === 'FAILED') {
      throw new Error(`Task failed: ${JSON.stringify(result)}`);
    }

    await sleep(interval);
  }

  throw new Error('Image generation timed out');
}

/* ================================================================
   EXPORTED FUNCTIONS
   ================================================================ */

/**
 * FULL TRY-ON: User photo + Product image → Fused try-on result
 * This is the main feature — analyzes both images and generates fusion
 * POST /api/tryon
 */
export async function virtualTryOn(userImageBase64, productImageBase64, size = '768x1344') {
  let userDescription = null;
  let productDescription = null;
  let combinedDescription = null;

  // Step 1: Try combined analysis first (best quality — sees both together)
  if (userImageBase64 && productImageBase64) {
    console.log('📸 Step 1: Analyzing user photo + product image together...');
    combinedDescription = await analyzeBothImages(userImageBase64, productImageBase64);

    if (combinedDescription) {
      console.log('🧬 Combined analysis:', combinedDescription);
    }
  }

  // Step 2: If combined failed, try individually
  if (!combinedDescription) {
    console.log('📸 Step 1a: Analyzing user photo individually...');
    userDescription = await analyzeUserPhoto(userImageBase64);

    console.log('👗 Step 1b: Analyzing product image individually...');
    productDescription = await analyzeProductImage(productImageBase64);

    if (userDescription) console.log('👤 User:', userDescription);
    if (productDescription) console.log('👔 Product:', productDescription);
  }

  // Step 3: Build the fusion prompt
  let fusionPrompt;

  if (combinedDescription) {
    // Best case: we have combined analysis
    fusionPrompt = `Photorealistic full-body fashion photo showing a person wearing the described clothing. ${combinedDescription}. The person is wearing the exact same garment with matching colors, fabric texture, design details, and fit. Studio lighting, clean white background, professional fashion photography, the clothing looks natural and realistically draped on their body.`;

  } else if (userDescription && productDescription) {
    // Good case: both analyzed individually
    fusionPrompt = `Photorealistic full-body fashion photo of a person with the following appearance: ${userDescription}. They are wearing the following garment: ${productDescription}. The clothing fits naturally on their body with realistic fabric draping, matching the exact colors, patterns, and design details. Studio lighting, clean white background, professional fashion photography, high quality.`;

  } else if (productDescription) {
    // Partial: only product analyzed
    fusionPrompt = `Photorealistic full-body fashion photo of a person wearing the following garment: ${productDescription}. The clothing fits naturally with realistic fabric draping, matching exact colors, patterns, and design details. Studio lighting, clean white background, professional fashion photography, high quality.`;

  } else if (userDescription) {
    // Partial: only user analyzed (shouldn't happen normally)
    fusionPrompt = `Photorealistic full-body fashion photo of a person with the following appearance: ${userDescription}. They are wearing fashionable, well-fitted clothing. Studio lighting, clean white background, professional fashion photography, high quality.`;

  } else {
    // Fallback: no analysis available
    fusionPrompt = `Photorealistic full-body fashion photo of a person wearing stylish, well-fitted clothing. Studio lighting, clean white background, professional fashion photography, high quality.`;
  }

  // Step 4: Generate the fusion image
  console.log('🎨 Step 2: Generating fusion try-on image...');
  const resultBase64 = await generateTryOnImage(fusionPrompt, size);

  return {
    resultImage: resultBase64,
    userDescription: userDescription,
    productDescription: productDescription,
    combinedDescription: combinedDescription
  };
}

/**
 * TEXT-ONLY TRY-ON: User photo + outfit text description
 * Fallback when no product image is available
 * POST /api/tryon/text
 */
export async function virtualTryOnByText(userImageBase64, outfitDescription, size = '768x1344') {
  console.log('📸 Step 1: Analyzing user photo...');
  const userDescription = await analyzeUserPhoto(userImageBase64);

  let tryOnPrompt;
  if (userDescription) {
    console.log('👤 User:', userDescription);
    tryOnPrompt = `Photorealistic full-body fashion photo of a person with the following appearance: ${userDescription}. They are wearing: ${outfitDescription}. The clothing fits naturally with realistic fabric draping. Studio lighting, clean white background, professional fashion photography, high quality.`;
  } else {
    console.log('📝 Using outfit-only prompt...');
    tryOnPrompt = `Photorealistic full-body fashion photo of a person wearing: ${outfitDescription}. Studio lighting, clean white background, professional fashion photography, high quality.`;
  }

  console.log('🎨 Step 2: Generating try-on image...');
  const resultBase64 = await generateTryOnImage(tryOnPrompt, size);

  return {
    resultImage: resultBase64,
    userDescription: userDescription,
    productDescription: null,
    combinedDescription: null
  };
}

/**
 * Generate outfit image only (no user photo)
 * POST /api/outfit/generate
 */
export async function generateOutfitImage(prompt) {
  const outfitPrompt = `Full-body fashion photo of a model wearing: ${prompt}. Professional fashion photography, studio lighting, clean background, high quality.`;
  return await generateTryOnImage(outfitPrompt, '768x1344');
}

/**
 * Analyze body type only
 * POST /api/analyze
 */
export async function analyzeBodyType(imageBase64) {
  const description = await analyzeUserPhoto(imageBase64);
  return description || 'Unable to analyze — vision models are currently overloaded.';
}