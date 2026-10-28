import { authenticate } from '@/lib/auth';
import { database, transaction } from '@/lib/db';
import { adminData, idempotentCommand } from '@/lib/service';
import { errorResponse, jsonBody } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    return Response.json(await adminData(database(), actor), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    const { action, input, key } = await jsonBody(request);
    const result = await transaction((db) => idempotentCommand(db, actor, key, action, input));
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
