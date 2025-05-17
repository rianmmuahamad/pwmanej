const express = require('express');
const session = require('express-session');
const connectSessionKnex = require('connect-session-knex');
const passport = require('./auth');
const db = require('./database');
const path = require('path');
const knex = require('knex');
require('dotenv').config();

const app = express();

// Log untuk debugging
console.log('Environment Variables:', {
  POSTGRES_URL: process.env.POSTGRES_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV
});

// Pastikan SESSION_SECRET ada
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required in environment variables');
}

// Konfigurasi Knex untuk penyimpanan sesi
const knexConfig = {
  client: 'pg',
  connection: process.env.POSTGRES_URL,
  useNullAsDefault: true,
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
  },
};

const knexInstance = knex(knexConfig);

// Inisialisasi penyimpanan sesi
const KnexSessionStore = connectSessionKnex(session);
const store = new KnexSessionStore({
  knex: knexInstance,
  tablename: 'sessions',
  createtable: true,
  clearInterval: 1000 * 60 * 60 // Bersihkan sesi kadaluarsa setiap jam
});

// Tentukan apakah di Vercel
const isVercel = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: {
    secure: isVercel, // true di Vercel (HTTPS), false di lokal (HTTP)
    maxAge: 24 * 60 * 60 * 1000 // 24 jam
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('public'));

// Middleware untuk cek autentikasi
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.redirect('/');
};

// Rute halaman login
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Rute autentikasi Google
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

// Rute dashboard
app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// Rute untuk mendapatkan data pengguna
app.get('/api/user', isAuthenticated, (req, res) => {
  console.log('User in /api/user:', req.user);
  if (!req.user || !req.user.displayName) {
    return res.status(401).json({ error: 'User not authenticated or profile incomplete' });
  }
  res.json({ displayName: req.user.displayName });
});

// API untuk manajemen password
app.get('/api/passwords', isAuthenticated, async (req, res) => {
  try {
    const rows = await db('passwords').where({ user_id: req.user.id });
    res.json(rows);
  } catch (err) {
    console.error('Error fetching passwords:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/passwords', isAuthenticated, async (req, res) => {
  const { website, username, password } = req.body;
  try {
    await db('passwords').insert({
      user_id: req.user.id,
      website,
      username,
      password
    });
    res.status(201).json({ message: 'Password saved' });
  } catch (err) {
    console.error('Error saving password:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/passwords/:id', isAuthenticated, async (req, res) => {
  const { website, username, password } = req.body;
  try {
    await db('passwords')
      .where({ id: req.params.id, user_id: req.user.id })
      .update({ website, username, password });
    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('Error updating password:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/passwords/:id', isAuthenticated, async (req, res) => {
  try {
    await db('passwords')
      .where({ id: req.params.id, user_id: req.user.id })
      .del();
    res.json({ message: 'Password deleted' });
  } catch (err) {
    console.error('Error deleting password:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Rute logout
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.redirect('/');
  });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
