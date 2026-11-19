import pg from 'pg';
import { readFile } from 'node:fs/promises';

export async function openDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(7761501)');
    await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return pool;
}

// The shared Worker uses a small subset of D1's prepared statement interface.
export function workerDatabase(pool) {
  function statement(sql, values = []) {
    let position = 0;
    const query = sql.replace(/\?/g, () => '$' + ++position);
    return {
      bind: (...parameters) => statement(sql, parameters),
      execute: (client) => client.query(query, values),
      async first() {
        return (await pool.query(query, values)).rows[0] ?? null;
      }
    };
  }
  return {
    prepare: statement,
    async batch(statements) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const results = [];
        for (const item of statements) {
          results.push({ results: (await item.execute(client)).rows });
        }
        await client.query('COMMIT');
        return results;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  };
}
