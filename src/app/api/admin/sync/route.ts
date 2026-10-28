import { z } from 'zod';
import { authenticate } from '@/lib/auth';
import { synchronize } from '@/lib/sync';
import { errorResponse, jsonBody } from '@/lib/http';
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    const { house } = z
      .object({ house: z.enum(['camara', 'senado']) })
      .parse(await jsonBody(request));
    return Response.json(await synchronize(house, actor));
  } catch (e) {
    return errorResponse(e);
  }
}
