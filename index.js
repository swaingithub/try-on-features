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
app.use('/results', express.static(path.join(process.cwd(), 'uploads', 'results')));

// API Routes
app.use('/api', tryonRoutes);

// Ensure upload directories exist
const dirs = ['uploads/temp', 'uploads/results'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.listen(PORT, () => {
  console.log(`🧥 Try-On Backend running on http://localhost:${PORT}`);
});