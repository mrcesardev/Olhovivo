import { authenticate } from '@/lib/auth';
import { boundedBody, errorResponse } from '@/lib/http';
import { applyPeople, parseTseCsv } from '@/lib/importers';
import { transaction } from '@/lib/db';
import { AppError } from '@/lib/service';
export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    if (actor.role !== 'admin') throw new AppError('Acesso restrito.', 403);
    const rows = parseTseCsv(await boundedBody(request, 1000000));
    await transaction(async (db) => {
      await applyPeople(db, rows);
      await db.query(
        "INSERT INTO radar.audit(actor_id,action,entity_id,after_data,reason) VALUES($1,'import:tse','tse',$2::jsonb,'Importação assistida de eleitos; revisar identidades e composição.')",
        [actor.id, JSON.stringify(rows)],
      );
    });
    return Response.json({ count: rows.length });
  } catch (e) {
    return errorResponse(e);
  }
}
