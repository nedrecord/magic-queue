// db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'magic-queue.db');

const db = new sqlite3.Database(DB_PATH);

// Initialize tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS magicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS table_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      magician_id INTEGER NOT NULL,
      table_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (magician_id, table_number),
      FOREIGN KEY (magician_id) REFERENCES magicians(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS summons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      magician_id INTEGER NOT NULL,
      table_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (magician_id, table_number),
      FOREIGN KEY (magician_id) REFERENCES magicians(id)
    );
  `);
});

module.exports = db;
