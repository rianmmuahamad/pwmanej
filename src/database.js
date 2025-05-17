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
});

// Initialize database tables
const setupDatabase = async () => {
  try {
    // Create users table if not exists
    const usersExists = await db.schema.hasTable('users');
    if (!usersExists) {
      await db.schema.createTable('users', (table) => {
        table.increments('id').primary();
        table.string('google_id').unique().notNullable();
        table.string('display_name').notNullable();
        table.string('email');
        table.timestamps(true, true);
      });
      console.log('Users table created');
    }

    // Create passwords table if not exists
    const passwordsExists = await db.schema.hasTable('passwords');
    if (!passwordsExists) {
      await db.schema.createTable('passwords', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
        table.string('website').notNullable();
        table.string('username').notNullable();
        table.string('password').notNullable();
        table.timestamps(true, true);
      });
      console.log('Passwords table created');
    }

    // Create sessions table if not exists
    const sessionsExists = await db.schema.hasTable('sessions');
    if (!sessionsExists) {
      await db.schema.createTable('sessions', (table) => {
        table.string('sid').primary();
        table.json('sess').notNullable();
        table.timestamp('expired').notNullable().index();
      });
      console.log('Sessions table created');
    }
  } catch (err) {
    console.error('Database setup error:', err);
    throw err;
  }
};

module.exports = { db, setupDatabase };
