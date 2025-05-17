const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { db } = require('./database');

// Serialize user to session
passport.serializeUser((user, done) => {
  done(null, user.id); // Only store user id in session
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await db('users').where('id', id).first();
    if (!user) {
      return done(new Error('User not found'));
    }
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'https://pwmanej.vercel.app/auth/google/callback',
  passReqToCallback: true
},
async (req, accessToken, refreshToken, profile, done) => {
  try {
    // Check if user exists
    let user = await db('users').where('google_id', profile.id).first();

    if (!user) {
      // Create new user
      [user] = await db('users')
        .insert({
          google_id: profile.id,
          display_name: profile.displayName,
          email: profile.emails?.[0]?.value,
          created_at: db.fn.now(),
          updated_at: db.fn.now()
        })
        .returning('*');
    }

    return done(null, user);
  } catch (err) {
    console.error('Google auth error:', err);
    return done(err);
  }
}));

module.exports = passport;
