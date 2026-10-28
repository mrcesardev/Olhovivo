import { timingSafeEqual } from 'node:crypto';
import { synchronize } from '@/lib/sync';
import { errorResponse } from '@/lib/http';
export const maxDuration = 300;
export async function GET(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`,
    given = request.headers.get('authorization') ?? '';
  if (
    !process.env.CRON_SECRET ||
    expected.length !== given.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(given))
  )
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  try {
    const camara = await synchronize('camara');
    const senado = await synchronize('senado');
    return Response.json({ camara, senado });
  } catch (e) {
    return errorResponse(e);
  }
}
