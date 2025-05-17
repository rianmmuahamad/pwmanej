const knex = require('knex');
require('dotenv').config();

// Konfigurasi Knex untuk PostgreSQL
const db = knex({
  client: 'pg',
  connection: process.env.POSTGRES_URL,
  useNullAsDefault: true
});

// Buat tabel passwords jika belum ada
db.schema.hasTable('passwords').then(exists => {
  if (!exists) {
    return db.schema.createTable('passwords', table => {
      table.increments('id').primary();
      table.string('user_id');
      table.string('website');
      table.string('username');
      table.string('password');
    });
  }
}).catch(err => {
  console.error('Error creating passwords table:', err);
});

module.exports = db;