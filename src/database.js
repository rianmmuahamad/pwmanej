const knex = require('knex');
require('dotenv').config();

// Konfigurasi Knex untuk PostgreSQL
const db = knex({
  client: 'pg',
  connection: process.env.POSTGRES_URL,
  useNullAsDefault: true,
  pool: {
    min: 2, // Minimum koneksi dalam pool
    max: 10, // Maksimum koneksi (kurang dari batas Vercel: 20)
    acquireTimeoutMillis: 5000, // Timeout 5 detik untuk mendapatkan koneksi
    idleTimeoutMillis: 30000, // Koneksi idle akan ditutup setelah 30 detik
    reapIntervalMillis: 1000, // Periksa koneksi idle setiap 1 detik
  },
  acquireConnectionTimeout: 5000 // Timeout global untuk mendapatkan koneksi
});

// Log untuk debugging
console.log('Knex initialized with connection:', process.env.POSTGRES_URL);

// Buat tabel passwords jika belum ada
db.schema.hasTable('passwords')
  .then(exists => {
    if (!exists) {
      console.log('Creating passwords table...');
      return db.schema.createTable('passwords', table => {
        table.increments('id').primary();
        table.string('user_id');
        table.string('website');
        table.string('username');
        table.string('password');
      });
    }
    console.log('Passwords table already exists.');
  })
  .then(() => {
    console.log('Database setup completed successfully.');
  })
  .catch(err => {
    console.error('Error setting up database:', err.message);
    process.exit(1); // Keluar jika gagal setup database
  });

module.exports = db;
