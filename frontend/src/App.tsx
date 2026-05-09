import { useState, useRef, useEffect } from 'react';
import './App.css';

// Preset outfit suggestions for a better user experience
const OUTFIT_PRESETS = [
  { label: '👗 Red Gown', prompt: 'An elegant red evening gown with sequin details, floor-length skirt, and a sophisticated silhouette.' },
  { label: '👔 Business Suit', prompt: 'A navy blue tailored business suit, crisp white dress shirt, and a premium silk tie.' },
  { label: '🧥 Casual Chic', prompt: 'A stylish beige trench coat layered over a white turtleneck with classic dark denim jeans.' },
  { label: '🏖️ Summer Vibes', prompt: 'A vibrant floral summer dress with delicate straps, perfect for a sunny day out.' },
  { label: '🏋️ Athleisure', prompt: 'Modern premium athleisure: sleek black leggings, matching sports bra, and a lightweight zip-up hoodie.' },
  { label: '🎩 Black Tie', prompt: 'A timeless black tuxedo with a satin lapel, bow tie, and highly polished oxford shoes.' },
];

const SIZE_OPTIONS = [
  { label: 'Portrait', sub: '768×1344', value: '768x1344' },
  { label: 'Square', sub: '1024×1024', value: '1024x1024' },
  { label: 'Landscape', sub: '1344×768', value: '1344x768' },
];

function App() {
  const [userImageFile, setUserImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [tryOnResult, setTryOnResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [selectedSize, setSelectedSize] = useState('768x1344');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [userDescription, setUserDescription] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError('Image must be under 10MB for optimal AI processing.');
        return;
      }
      setUserImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setTryOnResult(null);
      setError(null);
      setUserDescription(null);
    }
  };

  const handleTryOn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userImageFile) {
      setError('Please upload a photo to begin the transformation.');
      return;
    }
    if (!prompt.trim()) {
      setError('Describe the outfit you want to visualize.');
      return;
    }

    setLoading(true);
    setError(null);
    setUserDescription(null);
    setStatusMessage('📤 Initializing secure upload...');

    try {
      const formData = new FormData();
      formData.append('userPhoto', userImageFile);
      formData.append('prompt', prompt);
      formData.append('size', selectedSize);

      // Step-by-step progress simulation
      const steps = [
        '📸 Step 1/2: AI is analyzing your body type & pose...',
        '🧠 Processing anatomical mesh and lighting...',
        '🎨 Step 2/2: Synthesizing your custom outfit...',
        '✨ Refining textures and photorealistic details...'
      ];
      
      let stepIdx = 0;
      const statusInterval = setInterval(() => {
        if (stepIdx < steps.length) {
          setStatusMessage(steps[stepIdx]);
          stepIdx++;
        }
      }, 5000);

      const response = await fetch('http://localhost:3001/api/tryon', {
        method: 'POST',
        body: formData,
      });

      clearInterval(statusInterval);

      const data = await response.json();

      if (data.success) {
        setTryOnResult(data.resultImage);
        setUserDescription(data.userDescription || null);
        setStatusMessage(null);
      } else {
        setError(data.error || 'The AI encountered an issue. Please try a different photo.');
        setStatusMessage(null);
      }
    } catch (err) {
      setError('Connection failed. Please ensure the backend server is active.');
      setStatusMessage(null);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!tryOnResult) return;
    const link = document.createElement('a');
    link.href = tryOnResult;
    link.download = `virtual-studio-result-${Date.now()}.png`;
    link.click();
  };

  const handleReset = () => {
    setUserImageFile(null);
    setPreviewUrl(null);
    setTryOnResult(null);
    setPrompt('');
    setError(null);
    setUserDescription(null);
    setStatusMessage(null);
  };

  return (
    <div className="app-wrapper">
      <div className="container">
        <header className="header">
          <span className="badge">Next-Gen Generative Fashion</span>
          <h1>Virtual <br /> Fashion Studio</h1>
          <p className="subtitle">
            Upload your portrait and experience our dual-stage AI pipeline. 
            First, we analyze your unique build; then, we seamlessly manifest 
            any outfit with cinematic precision.
          </p>
        </header>

        <main className="main-content">
          <aside className="glass-card controls-card">
            <form onSubmit={handleTryOn}>
              {/* Step 1: Base Photo */}
              <div className="input-group">
                <div className="input-label">
                  <span className="label-num">1</span>
                  <span>Your Base Portrait</span>
                </div>
                <div
                  className={`upload-zone ${previewUrl ? 'has-file' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {previewUrl ? (
                    <>
                      <img src={previewUrl} alt="User Preview" className="upload-preview" />
                      <div className="upload-overlay">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <p style={{ marginTop: '12px', fontWeight: 700, fontSize: '0.9rem' }}>Replace Portrait</p>
                      </div>
                    </>
                  ) : (
                    <div className="upload-placeholder">
                      <div className="upload-icon-box">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </div>
                      <p style={{ fontWeight: 600 }}>Drop your photo here</p>
                      <p className="upload-hint">High resolution portrait recommended</p>
                    </div>
                  )}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    hidden
                  />
                </div>
              </div>

              {/* Step 2: Outfit Design */}
              <div className="input-group">
                <div className="input-label">
                  <span className="label-num">2</span>
                  <span>Outfit Visualization</span>
                </div>

                <div className="preset-grid">
                  {OUTFIT_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className={`preset-btn ${prompt === preset.prompt ? 'active' : ''}`}
                      onClick={() => setPrompt(preset.prompt)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your dream outfit in detail..."
                  rows={4}
                />
              </div>

              {/* Step 3: Global Size */}
              <div className="input-group">
                <div className="input-label">
                  <span className="label-num">3</span>
                  <span>Canvas Dimension</span>
                </div>
                <div className="size-options">
                  {SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`size-btn ${selectedSize === opt.value ? 'active' : ''}`}
                      onClick={() => setSelectedSize(opt.value)}
                    >
                      <div>{opt.label}</div>
                      <div style={{ fontSize: '0.65rem', opacity: 0.7, marginTop: '2px' }}>{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Trigger */}
              <button
                type="submit"
                className="submit-btn"
                disabled={!userImageFile || !prompt.trim() || loading}
              >
                {loading ? (
                  <>
                    <svg className="spin-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1.2s linear infinite' }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <span>Synthesizing...</span>
                  </>
                ) : (
                  <>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                      <path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" />
                    </svg>
                    <span>Generate Try-On</span>
                  </>
                )}
              </button>

              {statusMessage && !error && (
                <div className="status-toast">
                  <div className="pulse-dot"></div>
                  <span>{statusMessage}</span>
                </div>
              )}

              {error && (
                <div className="error-toast" style={{ marginTop: '20px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}
            </form>
          </aside>

          <section className="glass-card result-card">
            <div className="result-header">
              <h2>Masterpiece Preview</h2>
              {tryOnResult && <span className="status-dot"></span>}
            </div>

            <div className="result-display-area">
              {tryOnResult ? (
                <div className="result-image-wrapper">
                  <img src={tryOnResult} alt="Virtual Studio Result" className="final-image" />
                  {userDescription && (
                    <div className="body-description">
                      <h4>👤 AI Body Synthesis</h4>
                      <p>{userDescription}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  {loading ? (
                    <div className="ai-processing">
                      <div className="orb-loader">
                        <div className="orb"></div>
                        <div className="ring"></div>
                        <div className="ring-inner"></div>
                      </div>
                      <p style={{ fontWeight: 600, color: '#fff' }}>{statusMessage || 'The Studio is preparing...'}</p>
                    </div>
                  ) : (
                    <div style={{ opacity: 0.4, textAlign: 'center' }}>
                      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '24px' }}>
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Your transformation awaits</p>
                      <p style={{ fontSize: '0.85rem', marginTop: '10px' }}>
                        Dual-stage analysis & generation will happen here
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {tryOnResult && (
              <div className="result-actions">
                <button onClick={handleDownload} className="download-link">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Download Ultra-HD</span>
                </button>
                <button onClick={handleReset} className="reset-btn">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  <span>New Project</span>
                </button>
              </div>
            )}
          </section>
        </main>

        <footer className="footer">
          <div className="footer-logo">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
            </svg>
            <span>VirtualStudio Pro</span>
          </div>
          <p>© 2024 Powered by Z-AI Engine, CogView-4 & GLM-4V</p>
        </footer>
      </div>
    </div>
  );
}

export default App;