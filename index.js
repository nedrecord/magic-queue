// index.js
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const archiver = require('archiver');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

// Middleware
app.use(bodyParser.json());
app.use(cors());
app.use('/public', express.static(path.join(__dirname, 'public')));

// Simple auth middleware
function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.magicianId = payload.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Helper: create 40 table_codes
function createTableCodesForMagician(magicianId) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO table_codes (magician_id, table_number, created_at)
    VALUES (?, ?, ?)
  `);

  for (let table = 1; table <= 40; table++) {
    stmt.run(magicianId, table, now);
  }
  stmt.finalize();
}

// ROUTES

// Registration
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const created_at = new Date().toISOString();

    db.run(
      `INSERT INTO magicians (email, password_hash, created_at) VALUES (?, ?, ?)`,
      [email, password_hash, created_at],
      function (err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ error: 'Email already registered' });
          }
          console.error(err);
          return res.status(500).json({ error: 'Database error' });
        }

        const magicianId = this.lastID;
        createTableCodesForMagician(magicianId);

        const token = jwt.sign({ id: magicianId, email }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ token, magicianId });
      }
    );
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  db.get(`SELECT * FROM magicians WHERE email = ?`, [email], async (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: row.id, email }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, magicianId: row.id });
  });
});

// Download ZIP of 40 QR codes for this magician
app.get('/api/qrs/raw', authRequired, async (req, res) => {
  try {
    const magicianId = req.magicianId;

    // Build base URL from the current request (so it works on Render)
    const host = req.headers.host;
    const baseUrl = `https://${host}`;

    // Set headers so browser downloads a file
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="magic-queue-qrs.zip"'
    );

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      console.error(err);
      // You can't send JSON now because headers are already set,
      // but you can end the response.
      res.status(500).end();
    });

    // Pipe the ZIP stream to the response
    archive.pipe(res);

    // Generate 40 QR PNGs and add them to the archive
    for (let table = 1; table <= 40; table++) {
      const url = `${baseUrl}/summon?m=${magicianId}&t=${table}`;
      const pngBuffer = await QRCode.toBuffer(url, { type: 'png', margin: 1 });

      archive.append(pngBuffer, {
        name: `table-${String(table).padStart(2, '0')}.png`
      });
    }

    // Finalize the archive (this sends the ZIP)
    archive.finalize();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate QR ZIP' });
    } else {
      res.status(500).end();
    }
  }
});

// Summon endpoint (public)
app.get('/summon', (req, res) => {
  const m = parseInt(req.query.m, 10);
  const t = parseInt(req.query.t, 10);

  if (!m || !t || t < 1 || t > 40) {
    return res.status(400).send('Invalid summon link');
  }

  // Ensure magician exists
  db.get(`SELECT id FROM magicians WHERE id = ?`, [m], (err, magician) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Server error');
    }
    if (!magician) {
      return res.status(404).send('Magician not found');
    }

    const created_at = new Date().toISOString();

    // Insert or ignore (collapse duplicates)
    db.run(
      `
      INSERT OR IGNORE INTO summons (magician_id, table_number, created_at)
      VALUES (?, ?, ?)
    `,
      [m, t, created_at],
      (err2) => {
        if (err2) {
          console.error(err2);
          return res.status(500).send('Server error');
        }

        // Always show the same “magic will begin soon” page
        res.sendFile(path.join(__dirname, 'public', 'summon.html'));
      }
    );
  });
});

// Get queue for logged-in magician
app.get('/api/queue', authRequired, (req, res) => {
  const magicianId = req.magicianId;

  db.all(
    `SELECT table_number, created_at 
     FROM summons 
     WHERE magician_id = ?
     ORDER BY datetime(created_at) ASC`,
    [magicianId],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      return res.json({ summons: rows });
    }
  );
});

// Clear a table from queue
app.post('/api/queue/clear', authRequired, (req, res) => {
  const magicianId = req.magicianId;
  const { table_number } = req.body || {};
  const t = parseInt(table_number, 10);

  if (!t || t < 1 || t > 40) {
    return res.status(400).json({ error: 'Invalid table number' });
  }

  db.run(
    `DELETE FROM summons WHERE magician_id = ? AND table_number = ?`,
    [magicianId, t],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      return res.json({ status: 'ok' });
    }
  );
});

// Serve dashboard (simple v1 magician UI)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`Magic queue server running on port ${PORT}`);
});
