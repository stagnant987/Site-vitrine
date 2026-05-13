const express = require('express');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Storage vidéo
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = file.originalname.split('.').pop() || 'webm';
    cb(null, `rec_${ts}.${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'changez_ce_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// ── Upload vidéo (utilisateurs) ───────────────────────────────────
app.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  const meta = {
    filename: req.file.filename,
    size: req.file.size,
    date: new Date().toISOString(),
    userAgent: req.headers['user-agent'] || '',
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
  };
  const metaPath = path.join(uploadsDir, req.file.filename + '.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  res.json({ success: true });
});

// ── Admin auth ────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session.admin) return next();
  res.status(401).json({ error: 'Non autorisé' });
}

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.admin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Mot de passe incorrect' });
  }
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/admin/check', (req, res) => {
  res.json({ logged: !!req.session.admin });
});

// ── Liste des vidéos ──────────────────────────────────────────────
app.get('/admin/videos', requireAdmin, (req, res) => {
  const files = fs.readdirSync(uploadsDir)
    .filter(f => /\.(webm|mp4|ogg)$/.test(f))
    .map(f => {
      const metaFile = path.join(uploadsDir, f + '.json');
      const stat = fs.statSync(path.join(uploadsDir, f));
      let meta = { date: stat.birthtime.toISOString(), ip: '', userAgent: '' };
      if (fs.existsSync(metaFile)) {
        try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch (_) {}
      }
      return { name: f, size: stat.size, date: meta.date, ip: meta.ip, userAgent: meta.userAgent };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(files);
});

// ── Stream vidéo ──────────────────────────────────────────────────
app.get('/admin/video/:name', requireAdmin, (req, res) => {
  const name = path.basename(req.params.name);
  const file = path.join(uploadsDir, name);
  if (!fs.existsSync(file)) return res.status(404).send('Introuvable');
  res.sendFile(file);
});

// ── Supprimer vidéo ───────────────────────────────────────────────
app.delete('/admin/video/:name', requireAdmin, (req, res) => {
  const name = path.basename(req.params.name);
  const file = path.join(uploadsDir, name);
  const meta = file + '.json';
  if (fs.existsSync(file)) fs.unlinkSync(file);
  if (fs.existsSync(meta)) fs.unlinkSync(meta);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`));
