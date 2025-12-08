// index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const archiver = require('archiver');
const db = require('./db');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_SECRET = process.env.ADMIN_SECRET || null;

app.use(cors());
app.use(bodyParser.json());

// Serve static files from /public under /public/*
app.use('/public', express.static(path.join(__dirname, 'public')));

// ----------------- AUTH -----------------

// Admin-only register endpoint
app.post('/api/register', async (req, res) => {
  const { email, password, admin_secret } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  if (!ADMIN_SECRET) {
    console.error('ADMIN_SECRET is not configured.');
    return res.status(500).json({ error: 'Registration is not configured.' });
  }

  if (!admin_secret || admin_secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const existing = await db.get(
      'SELECT id FROM magicians WHERE email = $1',
      [email]
    );
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);

    const inserted = await db.get(
      'INSERT INTO magicians (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email, hash]
    );

    const magicianId = inserted.id;
    const token = jwt.sign({ magicianId }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, magicianId });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Normal login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const magician = await db.get(
      'SELECT id, password_hash FROM magicians WHERE email = $1',
      [email]
    );
    if (!magician) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, magician.password_hash);
    if (!ok) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ magicianId: magician.id }, JWT_SECRET, {
      expiresIn: '7d'
    });
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ----------------- AUTH MIDDLEWARE -----------------

function authRequired(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = parts[1];
  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err || !payload || !payload.magicianId) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.magicianId = payload.magicianId;
    next();
  });
}

// ----------------- NEW: /api/me -----------------
// Return the logged-in magician's ID + email for the placard generator.
app.get('/api/me', authRequired, async (req, res) => {
  const id = req.magicianId;

  try {
    const row = await db.get(
      'SELECT id, email FROM magicians WHERE id = $1',
      [id]
    );

    if (!row) {
      return res.status(404).json({ error: 'Magician not found' });
    }

    res.json(row);
  } catch (err) {
    console.error('me endpoint error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ----------------- QUEUE API -----------------

app.get('/api/queue', authRequired, async (req, res) => {
  const magicianId = req.magicianId;

  try {
    const mrow = await db.get(
      'SELECT paused FROM magicians WHERE id = $1',
      [magicianId]
    );
    if (!mrow) {
      return res.status(404).json({ error: 'Magician not found' });
    }

    const rows = await db.all(
      'SELECT table_number, last_requested_at FROM summons WHERE magician_id = $1 ORDER BY last_requested_at ASC',
      [magicianId]
    );

    res.json({
      paused: !!mrow.paused,
      summons: rows || []
    });
  } catch (err) {
    console.error('Queue fetch error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/queue/clear', authRequired, async (req, res) => {
  const magicianId = req.magicianId;
  const { table_number } = req.body || {};

  if (!table_number) {
    return res.status(400).json({ error: 'table_number required' });
  }

  try {
    await db.run(
      'DELETE FROM summons WHERE magician_id = $1 AND table_number = $2',
      [magicianId, table_number]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Queue clear error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Pause / resume queue
app.post('/api/pause', authRequired, async (req, res) => {
  const magicianId = req.magicianId;
  const { paused } = req.body || {};
  const pausedValue = !!paused;

  try {
    const result = await db.pool.query(
      'UPDATE magicians SET paused = $1 WHERE id = $2',
      [pausedValue, magicianId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Magician not found' });
    }
    res.json({ paused: pausedValue });
  } catch (err) {
    console.error('Pause error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ----------------- QR ZIP -----------------

app.get('/api/qrs/raw', authRequired, async (req, res) => {
  try {
    const magicianId = req.magicianId;
    const host = req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${proto}://${host}`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="magic-queue-qrs.zip"'
    );

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      console.error(err);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    archive.pipe(res);

    for (let table = 1; table <= 50; table++) {
      const url = `${baseUrl}/summon?m=${magicianId}&t=${table}`;
      const pngBuffer = await QRCode.toBuffer(url, {
        type: 'png',
        margin: 1
      });

      archive.append(pngBuffer, {
        name: `table-${String(table).padStart(2, '0')}.png`
      });
    }

    archive.finalize();
  } catch (err) {
    console.error('QR ZIP error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate QR ZIP' });
    } else {
      res.status(500).end();
    }
  }
});

// ----------------- SUMMON ENDPOINT -----------------

app.get('/summon', async (req, res) => {
  const m = parseInt(req.query.m, 10);
  const t = parseInt(req.query.t, 10);

  if (!m || !t) {
    return res.status(400).send('Bad request');
  }

  try {
    const magician = await db.get(
      'SELECT id, paused FROM magicians WHERE id = $1',
      [m]
    );
    if (!magician) {
      return res.status(404).send('Magician not found');
    }

    const now = Date.now();

    await db.run(
      `
      INSERT INTO summons (magician_id, table_number, last_requested_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (magician_id, table_number)
      DO UPDATE SET last_requested_at = EXCLUDED.last_requested_at
      `,
      [m, t, now]
    );

    const paused = !!magician.paused;
    const message = paused
      ? 'The magician is currently on a break, but will get to you when they are done.'
      : 'The magic will begin soon.';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Magic Queue</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 24px;
      text-align: center;
    }
    p {
      font-size: 1.1rem;
    }
  </style>
</head>
<body>
  <p>${message}</p>
</body>
</html>`;

    res.send(html);
  } catch (err) {
    console.error('Summon error:', err);
    res.status(500).send('Error');
  }
});

// ----------------- FRONTEND ROUTES -----------------

// Dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Admin account-creation page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// PWA manifest and service worker
app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Magic queue server running on port ${PORT}`);
});
