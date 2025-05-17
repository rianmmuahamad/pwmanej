// src/server.js
const express = require('express');
const session = require('express-session');
const connectSessionKnex = require('connect-session-knex');
const path = require('path');
require('dotenv').config();

// Import database and auth modules
const { db, setupDatabase } = require('./database');
const { passport, setupAuthTable } = require('./auth');

const app = express();

// Determine environment (Vercel vs local)
const isVercel = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';
console.log(`Running in ${isVercel ? 'Vercel' : 'local'} environment`);

// Validate required environment variables
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required in environment variables');
}

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL is required in environment variables');
}

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('Google OAuth credentials missing. Authentication will not work properly.');
}

// Initialize session store
const KnexSessionStore = connectSessionKnex(session);
const store = new KnexSessionStore({
  knex: db,
  tablename: 'sessions',
  createtable: true,
  sidfieldname: 'sid',
  clearInterval: 60000, // Clear expired sessions every minute
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: {
    secure: isVercel, // Only use secure cookies in production (HTTPS)
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('public'));

// Middleware for authentication check
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Authentication required' });
};

// Setup database and tables before starting the server
const initializeApp = async () => {
  try {
    // Setup database tables
    const dbSetup = await setupDatabase();
    const authSetup = await setupAuthTable();
    
    if (!dbSetup || !authSetup) {
      console.error('Failed to setup database tables');
      process.exit(1);
    }
    
    // Routes
    setupRoutes();
    
    // Start server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to initialize application:', err);
    process.exit(1);
  }
};

// Set up all routes
const setupRoutes = () => {
  // Home page (login)
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  // Google OAuth routes
  app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
      console.log('Google authentication successful');
      res.redirect('/dashboard');
    }
  );

  // Dashboard
  app.get('/dashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
  });

  // API Routes
  app.get('/api/user', isAuthenticated, (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    res.json({
      id: req.user.id,
      displayName: req.user.display_name,
      email: req.user.email
    });
  });

  // Password management API
  app.get('/api/passwords', isAuthenticated, async (req, res) => {
    try {
      const passwords = await db('passwords')
        .where({ user_id: req.user.id })
        .select('id', 'website', 'username', 'password');
      res.json(passwords);
    } catch (err) {
      console.error('Error fetching passwords:', err.message);
      res.status(500).json({ error: 'Failed to fetch passwords' });
    }
  });

  app.post('/api/passwords', isAuthenticated, async (req, res) => {
    const { website, username, password } = req.body;
    
    // Validate request
    if (!website || !username || !password) {
      return res.status(400).json({ error: 'Website, username and password are required' });
    }
    
    try {
      // Use a transaction to ensure database consistency
      await db.transaction(async trx => {
        const [id] = await trx('passwords').insert({
          user_id: req.user.id,
          website,
          username,
          password
        }).returning('id');
        
        res.status(201).json({ 
          id, 
          message: 'Password saved successfully' 
        });
      });
    } catch (err) {
      console.error('Error saving password:', err.message);
      res.status(500).json({ error: 'Failed to save password' });
    }
  });

  app.put('/api/passwords/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const { website, username, password } = req.body;
    
    // Validate request
    if (!website || !username || !password) {
      return res.status(400).json({ error: 'Website, username and password are required' });
    }
    
    try {
      // Use transaction for consistency
      await db.transaction(async trx => {
        // First check if password exists and belongs to user
        const existing = await trx('passwords')
          .where({ id, user_id: req.user.id })
          .first();
          
        if (!existing) {
          return res.status(404).json({ error: 'Password not found or access denied' });
        }
        
        await trx('passwords')
          .where({ id, user_id: req.user.id })
          .update({ website, username, password });
          
        res.json({ message: 'Password updated successfully' });
      });
    } catch (err) {
      console.error('Error updating password:', err.message);
      res.status(500).json({ error: 'Failed to update password' });
    }
  });

  app.delete('/api/passwords/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    
    try {
      // Use transaction for consistency
      await db.transaction(async trx => {
        // Check if password exists and belongs to user
        const existing = await trx('passwords')
          .where({ id, user_id: req.user.id })
          .first();
          
        if (!existing) {
          return res.status(404).json({ error: 'Password not found or access denied' });
        }
        
        await trx('passwords')
          .where({ id, user_id: req.user.id })
          .del();
          
        res.json({ message: 'Password deleted successfully' });
      });
    } catch (err) {
      console.error('Error deleting password:', err.message);
      res.status(500).json({ error: 'Failed to delete password' });
    }
  });

  // Logout
  app.get('/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error('Error during logout:', err);
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.redirect('/');
    });
  });

  // Health check endpoint for Vercel
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Handle 404
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  
  // Error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
};

// Start the application
initializeApp().catch(err => {
  console.error('Failed to start application:', err);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  db.destroy().then(() => {
    console.log('Database connections closed.');
    process.exit(0);
  });
});

// For development error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
