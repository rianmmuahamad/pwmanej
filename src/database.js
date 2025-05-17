const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Gunakan /tmp untuk Vercel, fallback ke lokal jika tidak di Vercel
const dbPath = process.env.VERCEL ? '/tmp/passwords.db' : path.join(__dirname, 'passwords.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS passwords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    website TEXT,
    username TEXT,
    password TEXT
  )`);
});

module.exports = db;