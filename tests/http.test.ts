import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authenticate } from '../src/lib/auth';
import { jsonBody, boundedBody } from '../src/lib/http';
test('API não aceita requisição administrativa sem autenticação', async () => {
  await assert.rejects(
    authenticate(new Request('http://localhost/api/admin')),
    /Entre na sua conta/,
  );
});
test('limite do corpo é aplicado antes do parse', async () => {
  await assert.rejects(
    boundedBody(new Request('http://localhost', { method: 'POST', body: 'x'.repeat(100) }), 10),
    /grande/,
  );
});
test('JSON malformado e content-type incorreto são rejeitados', async () => {
  await assert.rejects(
    jsonBody(
      new Request('http://localhost', {
        method: 'POST',
        body: '{',
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
    /JSON inválido/,
  );
  await assert.rejects(
    jsonBody(new Request('http://localhost', { method: 'POST', body: '{}' })),
    /Envie JSON/,
  );
});
