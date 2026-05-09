import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import tryonRoutes from './routes/tryon.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve result images statically
const resultsDir = path.join(process.cwd(), 'uploads', 'results');
if (fs.existsSync(resultsDir)) {
  app.use('/results', express.static(resultsDir));
}

// API Routes
app.use('/api', tryonRoutes);

// Ensure upload directories exist (wrap in try-catch for read-only environments like Vercel)
const dirs = ['uploads/temp', 'uploads/results'];
dirs.forEach(dir => {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn(`Could not create directory ${dir}: ${e.message}`);
  }
});

// For Vercel, we might want to serve /tmp if it's used
if (process.env.VERCEL) {
  app.use('/results', express.static('/tmp'));
}

app.get('/', (req, res) => {
  res.json({ message: '🧥 Try-On Backend is Live!', status: 'online' });
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🧥 Try-On Backend running on http://localhost:${PORT}`);
  });
}

export default app;