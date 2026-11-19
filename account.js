import { openDatabase } from './database.js';
import { hashPassword, normalizeEmail, validEmail } from './password.js';

const email = normalizeEmail(process.argv[2]);
if (!validEmail(email) || process.stdin.isTTY) {
  throw new Error('Provide the account email as an argument and pipe the password through stdin.');
}
let input = '';
for await (const chunk of process.stdin.setEncoding('utf8')) {
  input += chunk;
  if (input.length > 1024) throw new Error('Password is too long.');
}
const password = input.replace(/\r?\n$/, '');
if (password.length < 12 || password.length > 128) throw new Error('Use 12–128 characters.');
const pool = await openDatabase();
const client = await pool.connect();
try {
  await client.query('BEGIN');
  if (email !== normalizeEmail(process.env.GODOL_OWNER_EMAIL)) {
    const member = await client.query('SELECT 1 FROM members WHERE email = $1 FOR UPDATE', [email]);
    if (!member.rowCount) throw new Error('Assign the user an HR or Staff role before creating the account.');
  }
  await client.query(
    'INSERT INTO accounts(email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash',
    [email, await hashPassword(password)]
  );
  await client.query('DELETE FROM sessions WHERE email = $1', [email]);
  await client.query('COMMIT');
  console.log('Account password saved.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
