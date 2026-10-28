import { readFile } from 'node:fs/promises';
import { database } from '../src/lib/db';
const db = database();
const client = await db.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(2027,2)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS public.radar_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())',
  );
  const exists = await client.query(
    "SELECT 1 FROM public.radar_migrations WHERE name='001_initial'",
  );
  if (!exists.rows.length) {
    await client.query(await readFile('db/001_initial.sql', 'utf8'));
    await client.query("INSERT INTO public.radar_migrations(name) VALUES('001_initial')");
  }
  await client.query('COMMIT');
  console.log('Migrações aplicadas.');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await db.end();
}
