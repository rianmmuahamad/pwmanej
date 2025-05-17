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

// Log request information for debugging
app.use((req, res, next) => {
  const requestPath = req.originalUrl || req.url;
  console.log(`${new Date().toISOString()} - ${req.method} ${requestPath}`);
  next();
});

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
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  // Make sure serialization works correctly
  serializer: JSON.stringify,
  deserializer: JSON.parse
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable trust proxy for Vercel (important for session cookies behind proxy)
app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: store,
  proxy: true, // Trust the reverse proxy
  cookie: {
    secure: isVercel, // Only use secure cookies in production (HTTPS)
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
    path: '/',
    httpOnly: true
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('public'));

// Middleware for authentication check
const isAuthenticated = (req, res, next) => {
  console.log('Auth check - isAuthenticated:', req.isAuthenticated());
  console.log('Auth check - session:', req.session);
  console.log('Auth check - user:', req.user);
  
  if (req.isAuthenticated()) return next();
  
  // For API routes, return JSON error
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // For page routes, redirect to login
  res.redirect('/');
};

  // Try to set up necessary database tables
  const setupTables = async () => {
    // Create users table if it doesn't exist
    const usersExists = await db.schema.hasTable('users');
    if (!usersExists) {
      console.log('Creating users table...');
      await db.schema.createTable('users', table => {
        table.increments('id').primary();
        table.string('google_id').unique().notNullable();
        table.string('display_name').notNullable();
        table.string('email');
        table.timestamps(true, true);
      });
      console.log('Users table created successfully');
    }
    
    // Create passwords table if it doesn't exist
    const passwordsExists = await db.schema.hasTable('passwords');
    if (!passwordsExists) {
      console.log('Creating passwords table...');
      await db.schema.createTable('passwords', table => {
        table.increments('id').primary();
        table.integer('user_id').notNullable().index();
        table.string('website').notNullable();
        table.string('username').notNullable();
        table.string('password').notNullable();
        table.timestamps(true, true);
      });
      console.log('Passwords table created successfully');
    }
    
    // Create sessions table if it doesn't exist
    const sessionsExists = await db.schema.hasTable('sessions');
    if (!sessionsExists) {
      console.log('Creating sessions table...');
      await db.schema.createTable('sessions', table => {
        table.string('sid').primary();
        table.json('sess').notNullable();
        table.timestamp('expired').notNullable().index();
      });
      console.log('Sessions table created successfully');
    }
    
    return true;
  };
    
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
    // If already authenticated, redirect to dashboard
    if (req.isAuthenticated()) {
      return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  // Google OAuth routes
  app.get('/auth/google',
    (req, res, next) => {
      console.log('Initiating Google OAuth flow');
      next();
    },
    passport.authenticate('google', { 
      scope: ['profile', 'email'],
      prompt: 'select_account' // Always show account selection screen
    })
  );

  app.get('/auth/google/callback',
    (req, res, next) => {
      console.log('Google callback received');
      next();
    },
    passport.authenticate('google', { 
      failureRedirect: '/',
      failureFlash: false 
    }),
    (req, res) => {
      console.log('Google authentication successful. User:', req.user?.display_name);
      
      // Add debug info to session to track issues
      if (req.session) {
        req.session.authTime = new Date().toISOString();
        req.session.authSuccess = true;
      }
      
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
