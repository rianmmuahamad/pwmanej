// src/database.js
const knex = require('knex');
require('dotenv').config();

// Knex configuration optimized for Vercel serverless environment
const db = knex({
  client: 'pg',
  connection: process.env.POSTGRES_URL,
  useNullAsDefault: true,
  pool: {
    min: 0, // Start with no connections for serverless
    max: 7, // Keep max connections well below Vercel's limit of 20
    acquireTimeoutMillis: 10000, // Increase timeout for connection acquisition
    idleTimeoutMillis: 10000, // Reduce idle timeout for serverless environment
    createTimeoutMillis: 10000, // Timeout for creating new connections
    destroyTimeoutMillis: 5000, // Timeout for destroying connections
    reapIntervalMillis: 1000, // Check for idle connections every second
  },
  acquireConnectionTimeout: 10000 // Global timeout for connection acquisition
});

// Create passwords table if it doesn't exist
const setupDatabase = async () => {
  try {
    console.log('Checking database connection and tables...');
    
    // First check if we can connect
    await db.raw('SELECT 1');
    console.log('Database connection successful');
    
    // Check if table exists
    const exists = await db.schema.hasTable('passwords');
    if (!exists) {
      console.log('Creating passwords table...');
      await db.schema.createTable('passwords', table => {
        table.increments('id').primary();
        table.string('user_id').notNullable().index();
        table.string('website').notNullable();
        table.string('username').notNullable();
        table.string('password').notNullable();
        table.timestamps(true, true);
      });
      console.log('Passwords table created successfully');
    } else {
      console.log('Passwords table already exists');
    }
    
    console.log('Database setup completed successfully');
    return true;
  } catch (err) {
    console.error('Error setting up database:', err.message);
    return false;
  }
};

// Export both the db connection and setup function
module.exports = { db, setupDatabase };
