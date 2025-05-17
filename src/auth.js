// src/auth.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { db } = require('./database');
require('dotenv').config();

// Initialize Google OAuth strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
    proxy: true
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user exists
      let user = await db('users').where({ google_id: profile.id }).first();
      
      if (!user) {
        // Create new user if not exists
        const newUser = {
          google_id: profile.id,
          display_name: profile.displayName,
          email: profile.emails?.[0]?.value || null,
          created_at: new Date()
        };
        
        // Insert and get the new user
        const [userId] = await db('users').insert(newUser).returning('id');
        user = { id: userId, ...newUser };
        console.log('New user created:', user.display_name);
      } else {
        console.log('Existing user logged in:', user.display_name);
      }
      
      return done(null, user);
    } catch (err) {
      console.error('Error in Google authentication:', err.message);
      return done(err, null);
    }
  }
));

// Serialize user to store in session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await db('users').where({ id }).first();
    done(null, user);
  } catch (err) {
    console.error('Error deserializing user:', err.message);
    done(err, null);
  }
});

// Setup users table
const setupAuthTable = async () => {
  try {
    const exists = await db.schema.hasTable('users');
    if (!exists) {
      console.log('Creating users table...');
      await db.schema.createTable('users', table => {
        table.increments('id').primary();
        table.string('google_id').unique().notNullable();
        table.string('display_name').notNullable();
        table.string('email');
        table.timestamps(true, true);
      });
      console.log('Users table created successfully');
    } else {
      console.log('Users table already exists');
    }
    return true;
  } catch (err) {
    console.error('Error setting up users table:', err.message);
    return false;
  }
};

module.exports = { passport, setupAuthTable };
