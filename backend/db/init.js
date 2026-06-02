/**
 * db/init.js — run once to create tables and the first admin user.
 *
 *   node db/init.js
 *   node db/init.js --reset   (drop + recreate — dev only!)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs   = require('fs');
const path = require('path');
const pool = require('./pool');
const bcrypt = require('bcrypt');

async function main() {
  const reset = process.argv.includes('--reset');
  const client = await pool.connect();

  try {
    if (reset) {
      console.log('⚠️  Dropping all tables…');
      await client.query(`
        DROP TABLE IF EXISTS files, zoom_meetings, emails, cases, users CASCADE;
        DROP FUNCTION IF EXISTS set_updated_at CASCADE;
      `);
    }

    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(sql);
    console.log('✅ Schema applied.');

    const { rowCount } = await client.query('SELECT 1 FROM users LIMIT 1');
    if (rowCount === 0) {
      const hash = await bcrypt.hash('changeme123', 12);
      await client.query(
        `INSERT INTO users (username, password_hash, display_name, role)
         VALUES ($1, $2, $3, $4)`,
        ['ana@kamkhadze.com', hash, 'Ana Kamkhadze', 'admin']
      );
      console.log('✅ Default admin created:  ana@kamkhadze.com / changeme123');
      console.log('   ⚠️  Change this password immediately after first login!');
    } else {
      console.log('ℹ️  Users table already has rows — skipping seed.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error('Init failed:', err.message); process.exit(1); });
