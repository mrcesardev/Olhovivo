import { createClient } from '@supabase/supabase-js';
import { database } from './db';
import { AppError } from './service';
import type { Actor } from './types';

export async function authenticate(request: Request): Promise<Actor> {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new AppError('Entre na sua conta para continuar.', 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !process.env.DATABASE_URL)
    throw new AppError('Autenticação não configurada.', 503);
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new AppError('Sessão inválida ou expirada.', 401);
  const actor = (
    await database().query<Actor>('SELECT * FROM radar.app_users WHERE id=$1 AND active', [
      data.user.id,
    ])
  ).rows[0];
  if (!actor) throw new AppError('Sua conta não possui acesso ao painel.', 403);
  if (request.method !== 'GET') {
    const bucket = Math.floor(Date.now() / 60000);
    const count = (
      await database().query<{ count: number }>(
        'INSERT INTO radar.rate_limits(actor_id,bucket) VALUES($1,$2) ON CONFLICT(actor_id,bucket) DO UPDATE SET count=radar.rate_limits.count+1 RETURNING count',
        [actor.id, bucket],
      )
    ).rows[0].count;
    if (count > 60) throw new AppError('Limite de atualizações atingido. Aguarde um minuto.', 429);
  }
  return actor;
}
