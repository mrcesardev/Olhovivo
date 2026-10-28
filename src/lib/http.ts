import { ZodError } from 'zod';
import { AppError } from './service';
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError)
    return Response.json(
      { error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
      { status: 400 },
    );
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
    return Response.json(
      { error: 'Este registro já existe ou a vaga está ocupada. Atualize o painel.' },
      { status: 409 },
    );
  console.error('radar_request_failed', error instanceof Error ? error.message : 'unknown');
  return Response.json(
    { error: 'Não foi possível concluir. Seus dados não foram substituídos. Tente novamente.' },
    { status: 500 },
  );
}
export async function boundedBody(request: Request, max = 128000): Promise<string> {
  if (Number(request.headers.get('content-length')) > max)
    throw new AppError('Conteúdo muito grande.', 413);
  const reader = request.body?.getReader();
  if (!reader) return '';
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new AppError('Conteúdo muito grande.', 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export async function jsonBody(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new AppError('Envie JSON.', 415);
  try {
    return JSON.parse(await boundedBody(request));
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('JSON inválido.');
  }
}
