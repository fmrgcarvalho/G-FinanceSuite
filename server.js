const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", 'https://cdnjs.cloudflare.com'],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", 'data:'],
      connectSrc:  ["'self'", 'https://cdnjs.cloudflare.com'],
      fontSrc:     ["'self'"],
      objectSrc:     ["'none'"],
      frameSrc:      ["'none'"],
      scriptSrcAttr: ["'unsafe-inline'"], // onmouseenter/onmouseleave nos botões dinâmicos (CLAUDE.md)
    },
  },
  crossOriginEmbedderPolicy: false, // required for CDN resources
}));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'docs')));

// ── Auth endpoint ─────────────────────────────────────────────────────────────
// Validates token server-side; credentials never sent to the browser.
app.post('/api/login', (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token required' });

  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'users.json'), 'utf8'));
  } catch {
    return res.status(500).json({ error: 'auth config unavailable' });
  }

  const user = config.users.find(u => u.token === token);
  if (!user) return res.status(401).json({ error: 'invalid token' });

  const sessionHours = config.sessionHours || 8;
  const expiresAt    = new Date(Date.now() + sessionHours * 3_600_000).toISOString();
  res.json({ name: user.name, expiresAt });
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
