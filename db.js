// db.js
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Set it in your Render environment.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function init() {
  // magicians table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS magicians (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      paused BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  // summons table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS summons (
      magician_id INTEGER NOT NULL,
      table_number INTEGER NOT NULL,
      last_requested_at BIGINT NOT NULL,
      PRIMARY KEY (magician_id, table_number),
      CONSTRAINT fk_magician
        FOREIGN KEY (magician_id)
        REFERENCES magicians(id)
        ON DELETE CASCADE
    )
  `);

  console.log('Database initialized');
}

init().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Little helpers, modeled after sqlite-style get/all/run

async function get(sql, params) {
  // temporary debug log if we need it
  // console.log('DB GET:', sql, params);
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

async function all(sql, params) {
  // console.log('DB ALL:', sql, params);
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function run(sql, params) {
  // console.log('DB RUN:', sql, params);
  await pool.query(sql, params);
}

module.exports = {
  pool,
  get,
  all,
  run
};
