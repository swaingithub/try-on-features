import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import {
  handleTryOn,
  handleTryOnByText,
  handleGenerateOutfit,
  handleAnalyze,
} from '../controllers/tryonController.js';

const router = Router();

// Multer config — supports multiple file fields
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.VERCEL 
      ? '/tmp' 
      : path.join(process.cwd(), 'uploads', 'temp');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and WebP images are allowed'));
    }
  },
});

// ✅ Full try-on: user photo + product image (TWO file uploads)
router.post(
  '/tryon',
  upload.fields([
    { name: 'userPhoto', maxCount: 1 },
    { name: 'productImage', maxCount: 1 },
  ]),
  handleTryOn
);

// Text-based try-on: user photo + text description
router.post('/tryon/text', upload.single('userPhoto'), handleTryOnByText);

// Generate outfit image only
router.post('/outfit/generate', handleGenerateOutfit);

// Analyze body type
router.post('/analyze', upload.single('userPhoto'), handleAnalyze);

export default router;