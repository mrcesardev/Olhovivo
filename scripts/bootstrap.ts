import { z } from 'zod';
import { database } from '../src/lib/db';
const [userId, email, name] = process.argv.slice(2);
z.string().uuid().parse(userId);
z.email().parse(email);
z.string().min(2).parse(name);
const db = database();
try {
  const existing = await db.query('SELECT 1 FROM radar.app_users LIMIT 1');
  if (existing.rows.length)
    throw new Error('Bootstrap já executado. Gerencie acessos pelo dashboard.');
  await db.query("INSERT INTO radar.app_users(id,email,name,role) VALUES($1,$2,$3,'admin')", [
    userId,
    email,
    name,
  ]);
  console.log('Administrador autorizado. Use a senha definida no Supabase Auth.');
} finally {
  await db.end();
}
