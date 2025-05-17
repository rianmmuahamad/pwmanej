const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();

// Log untuk debugging
console.log('VERCEL_ENV:', process.env.VERCEL_ENV);

// Tentukan callbackURL berdasarkan VERCEL_ENV
const isVercel = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';
const callbackURL = isVercel 
  ? 'https://your-vercel-app.vercel.app/auth/google/callback' 
  : 'http://localhost:3000/auth/google/callback';

console.log('Is Vercel environment:', isVercel);
console.log('Callback URL being used:', callbackURL);
console.log('Google Client ID:', process.env.GOOGLE_CLIENT_ID);
console.log('Google Client Secret:', process.env.GOOGLE_CLIENT_SECRET);

passport.serializeUser((user, done) => {
  console.log('Serializing user:', user);
  done(null, user);
});

passport.deserializeUser((user, done) => {
  console.log('Deserializing user:', user);
  done(null, user);
});

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: callbackURL
}, (accessToken, refreshToken, profile, done) => {
  console.log('Google OAuth Response:', { accessToken, profile });
  return done(null, profile);
}, (error, req, res, next) => {
  console.error('Google OAuth Error:', error);
  return next(error);
}));

module.exports = passport;
