const express = require('express');
const session = require('express-session');
const passport = require('./auth');
const db = require('./database');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
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
  res.json({ displayName: req.user.displayName });
});

// API untuk manajemen password
app.get('/api/passwords', isAuthenticated, (req, res) => {
  db.all('SELECT * FROM passwords WHERE user_id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/passwords', isAuthenticated, (req, res) => {
  const { website, username, password } = req.body;
  db.run('INSERT INTO passwords (user_id, website, username, password) VALUES (?, ?, ?, ?)',
    [req.user.id, website, username, password], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Password saved' });
    });
});

app.put('/api/passwords/:id', isAuthenticated, (req, res) => {
  const { website, username, password } = req.body;
  db.run('UPDATE passwords SET website = ?, username = ?, password = ? WHERE id = ? AND user_id = ?',
    [website, username, password, req.params.id, req.user.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Password updated' });
    });
});

app.delete('/api/passwords/:id', isAuthenticated, (req, res) => {
  db.run('DELETE FROM passwords WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Password deleted' });
  });
});

// Rute logout
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.redirect('/');
  });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));