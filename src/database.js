const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./passwords.db');

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