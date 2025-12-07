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

app.use(cors());
app.use(bodyParser.json());

// static files
app.use('/public', express.static(path.join(__dirname, 'public')));

// helper: auth middleware
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

// auth routes
app.post('/api/register', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  db.get(
    'SELECT id FROM magicians WHERE email = ?',
    [email],
    async (err, existing) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (existing) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      try {
        const hash = await bcrypt.hash(password, 10);
        db.run(
          'INSERT INTO magicians (email, password_hash) VALUES (?, ?)',
          [email, hash],
          function (err2) {
            if (err2) {
              console.error(err2);
              return res.status(500).json({ error: 'Database error' });
            }
            const magicianId = this.lastID;
            const token = jwt.sign({ magicianId }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ token });
          }
        );
      } catch (hashErr) {
        console.error(hashErr);
        res.status(500).json({ error: 'Failed to hash password' });
      }
    }
  );
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  db.get(
    'SELECT id, password_hash FROM magicians WHERE email = ?',
    [email],
    async (err, magician) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!magician) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }

      try {
        const ok = await bcrypt.compare(password, magician.password_hash);
        if (!ok) {
          return res.status(400).json({ error: 'Invalid email or password' });
        }
        const token = jwt.sign({ magicianId: magician.id }, JWT_SECRET, {
          expiresIn: '7d'
        });
        res.json({ token });
      } catch (cmpErr) {
        console.error(cmpErr);
        res.status(500).json({ error: 'Error verifying password' });
      }
    }
  );
});

// queue API
app.get('/api/queue', authRequired, (req, res) => {
  const magicianId = req.magicianId;

  db.get(
    'SELECT paused FROM magicians WHERE id = ?',
    [magicianId],
    (err, mrow) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!mrow) {
        return res.status(404).json({ error: 'Magician not found' });
      }
      const paused = !!mrow.paused;

      db.all(
        'SELECT table_number, last_requested_at FROM summons WHERE magician_id = ? ORDER BY last_requested_at ASC',
        [magicianId],
        (err2, rows) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ error: 'Database error' });
          }
          res.json({
            paused,
            summons: rows || []
          });
        }
      );
    }
  );
});

app.post('/api/queue/clear', authRequired, (req, res) => {
  const magicianId = req.magicianId;
  const { table_number } = req.body || {};

  if (!table_number) {
    return res.status(400).json({ error: 'table_number required' });
  }

  db.run(
    'DELETE FROM summons WHERE magician_id = ? AND table_number = ?',
    [magicianId, table_number],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ success: true });
    }
  );
});

// pause / resume queue
app.post('/api/pause', authRequired, (req, res) => {
  const magicianId = req.magicianId;
  const { paused } = req.body || {};

  const pausedValue = paused ? 1 : 0;

  db.run(
    'UPDATE magicians SET paused = ? WHERE id = ?',
    [pausedValue, magicianId],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Magician not found' });
      }
      res.json({ paused: !!pausedValue });
    }
  );
});

// QR ZIP endpoint
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

    for (let table = 1; table <= 40; table++) {
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
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate QR ZIP' });
    } else {
      res.status(500).end();
    }
  }
});

// summon endpoint (scanned by guests)
app.get('/summon', (req, res) => {
  const m = parseInt(req.query.m, 10);
  const t = parseInt(req.query.t, 10);

  if (!m || !t) {
    return res.status(400).send('Bad request');
  }

  db.get(
    'SELECT id, paused FROM magicians WHERE id = ?',
    [m],
    (err, magician) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error');
      }
      if (!magician) {
        return res.status(404).send('Magician not found');
      }

      const now = Date.now();

      db.run(
        `
        INSERT INTO summons (magician_id, table_number, last_requested_at)
        VALUES (?, ?, ?)
        ON CONFLICT(magician_id, table_number)
        DO UPDATE SET last_requested_at = excluded.last_requested_at
        `,
        [m, t, now],
        (err2) => {
          if (err2) {
            console.error(err2);
            return res.status(500).send('Error logging summon');
          }

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
        }
      );
    }
  );
});

// dashboard and root
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Magic queue server running on port ${PORT}`);
});
