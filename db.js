// db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'magic-queue.sqlite3');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS magicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      paused INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS summons (
      magician_id INTEGER NOT NULL,
      table_number INTEGER NOT NULL,
      last_requested_at INTEGER NOT NULL,
      PRIMARY KEY (magician_id, table_number),
      FOREIGN KEY (magician_id) REFERENCES magicians(id) ON DELETE CASCADE
    )
  `);
});

module.exports = db;
