const express = require('express');
const session = require('express-session');
const connectSessionKnex = require('connect-session-knex');
const path = require('path');
const passport = require('./auth');
const { db, setupDatabase } = require('./database');
require('dotenv').config();

const app = express();

// Verify required environment variables
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required');
}
if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL is required');
}
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('Google OAuth credentials missing - authentication will not work');
}

// Configure session store
const KnexSessionStore = connectSessionKnex(session);
const store = new KnexSessionStore({
  knex: db,
  tablename: 'sessions',
  createtable: true,
  clearInterval: 1000 * 60 * 60 // Cleanup expired sessions hourly
});

const isVercel = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: {
    secure: isVercel,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('public'));

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  res.redirect('/');
};

// Routes
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Google OAuth routes
app.get('/auth/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

// Dashboard route
app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// API routes
app.get('/api/user', isAuthenticated, (req, res) => {
  res.json({
    id: req.user.id,
    displayName: req.user.display_name,
    email: req.user.email
  });
});

// Password management API
app.get('/api/passwords', isAuthenticated, async (req, res) => {
  try {
    const passwords = await db('passwords').where({ user_id: req.user.id });
    res.json(passwords);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/passwords', isAuthenticated, async (req, res) => {
  const { website, username, password } = req.body;
  try {
    const [newPassword] = await db('passwords')
      .insert({
        user_id: req.user.id,
        website,
        username,
        password
      })
      .returning('*');
    res.status(201).json(newPassword);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/passwords/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { website, username, password } = req.body;
  try {
    const updated = await db('passwords')
      .where({ id, user_id: req.user.id })
      .update({ website, username, password })
      .returning('*');
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/passwords/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    await db('passwords')
      .where({ id, user_id: req.user.id })
      .del();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.redirect('/');
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize and start server
const startServer = async () => {
  try {
    await setupDatabase();
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();
