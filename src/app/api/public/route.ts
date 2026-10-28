import { database } from '@/lib/db';
import { publicData } from '@/lib/service';
import { demoData } from '@/lib/demo';
import { errorResponse } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const house = new URL(request.url).searchParams.get('casa') === 'senado' ? 'senado' : 'camara';
  if (!process.env.DATABASE_URL)
    return Response.json(demoData(house), { headers: { 'Cache-Control': 'no-store' } });
  const db = await database().connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const data = await publicData(db, house);
    await db.query('COMMIT');
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    await db.query('ROLLBACK');
    return errorResponse(e);
  } finally {
    db.release();
  }
}
