const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { db } = require('./database');
require('dotenv').config();

// Configure Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id); // Only serialize the user ID
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await db('users').where({ id }).first();
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Configure Google OAuth strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
},
async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user exists
    let user = await db('users').where({ google_id: profile.id }).first();

    if (!user) {
      // Create new user
      [user] = await db('users').insert({
        google_id: profile.id,
        display_name: profile.displayName,
        email: profile.emails?.[0]?.value,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      }).returning('*');
    }

    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
}));

module.exports = passport;
