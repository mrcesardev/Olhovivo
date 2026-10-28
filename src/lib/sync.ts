import { database, transaction } from './db';
import { applyPeople, collectOfficial } from './importers';
import type { Actor, House } from './types';
import { AppError } from './service';
export async function synchronize(h: House, actor?: Actor) {
  if (actor && actor.role !== 'admin')
    throw new AppError('Somente administrador pode sincronizar.', 403);
  const db = database();
  // Recover interrupted jobs older than the hosting time limit, without erasing their history.
  await db.query(
    "UPDATE radar.sync_runs SET status='failed',details='Execução interrompida; tente novamente.',finished_at=now() WHERE status='running' AND started_at<now()-interval '10 minutes'",
  );
  const run = (
    await db.query<{ id: string }>(
      "INSERT INTO radar.sync_runs(house,status) VALUES($1,'running') RETURNING id",
      [h],
    )
  ).rows[0];
  try {
    const people = await collectOfficial(h);
    await transaction(async (tx) => {
      const previous = (await tx.query('SELECT * FROM radar.people WHERE origin=$1', [h])).rows;
      await applyPeople(tx, people);
      await tx.query(
        "UPDATE radar.elections SET version=version+1,updated_at=now() WHERE house=$1 AND phase='tracking'",
        [h],
      );
      await tx.query('DELETE FROM radar.rate_limits WHERE bucket<$1', [
        Math.floor(Date.now() / 60000) - 1440,
      ]);
      await tx.query(
        "UPDATE radar.sync_runs SET status='success',count=$2,details='Cadastro atualizado. Composição e apoios não foram alterados.',finished_at=now() WHERE id=$1",
        [run.id, people.length],
      );
      await tx.query(
        'INSERT INTO radar.audit(actor_id,action,entity_id,before_data,after_data,reason) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)',
        [
          actor?.id ?? null,
          'sync',
          run.id,
          JSON.stringify(previous),
          JSON.stringify(people),
          'Sincronização oficial; exceções manuais preservadas.',
        ],
      );
    });
    return { id: run.id, count: people.length };
  } catch (error) {
    await db.query(
      "UPDATE radar.sync_runs SET status='failed',details=$2,finished_at=now() WHERE id=$1",
      [run.id, error instanceof Error ? error.message.slice(0, 300) : 'Falha de sincronização.'],
    );
    throw error;
  }
}
