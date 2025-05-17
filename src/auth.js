const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.VERCEL ? 'https://pwmanej.vercel.app/auth/google/callback' : 'http://localhost:3000/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
  console.log('Google OAuth Response:', { accessToken, profile });
  return done(null, profile);
}, (error, req, res, next) => {
  console.error('Google OAuth Error:', error);
  return next(error);
}));

module.exports = passport;