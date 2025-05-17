const knex = require('knex');
require('dotenv').config();

const db = knex({
  client: 'pg',
  connection: process.env.POSTGRES_URL,
  useNullAsDefault: true,
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
  },
  acquireConnectionTimeout: 5000
});

// Setup database tables
const setupDatabase = async () => {
  try {
    // Create users table if not exists
    const usersExists = await db.schema.hasTable('users');
    if (!usersExists) {
      await db.schema.createTable('users', table => {
        table.increments('id').primary();
        table.string('google_id').unique();
        table.string('display_name');
        table.string('email');
        table.timestamps(true, true);
      });
      console.log('Created users table');
    }

    // Create passwords table if not exists
    const passwordsExists = await db.schema.hasTable('passwords');
    if (!passwordsExists) {
      await db.schema.createTable('passwords', table => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().references('id').inTable('users');
        table.string('website');
        table.string('username');
        table.string('password');
        table.timestamps(true, true);
      });
      console.log('Created passwords table');
    }

    // Create sessions table if not exists
    const sessionsExists = await db.schema.hasTable('sessions');
    if (!sessionsExists) {
      await db.schema.createTable('sessions', table => {
        table.string('sid').primary();
        table.json('sess').notNullable();
        table.timestamp('expired').notNullable().index();
      });
      console.log('Created sessions table');
    }
  } catch (err) {
    console.error('Database setup error:', err);
    throw err;
  }
};

module.exports = { db, setupDatabase };
