import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { command, idempotentCommand, publicData, AppError } from '../src/lib/service';
import type { DB } from '../src/lib/db';
import type { Actor } from '../src/lib/types';
import { collectOfficial, applyPeople, parseTseCsv } from '../src/lib/importers';

const pg = new PGlite();
const db = pg as unknown as DB;
const admin: Actor = {
  id: randomUUID(),
  name: 'Admin',
  email: 'admin@example.com',
  role: 'admin',
  active: true,
};
const editor: Actor = {
  id: randomUUID(),
  name: 'Editor',
  email: 'editor@example.com',
  role: 'editor',
  active: true,
};
const reviewer: Actor = {
  id: randomUUID(),
  name: 'Revisor',
  email: 'reviewer@example.com',
  role: 'reviewer',
  active: true,
};
let election: string, people: string[], candidates: string[];
const source = 'https://www.camara.leg.br/noticias/exemplo';
async function run(actor: Actor, action: string, input: unknown) {
  await pg.exec('BEGIN');
  try {
    const result = await command(db, actor, action, input);
    await pg.exec('COMMIT');
    return result;
  } catch (e) {
    await pg.exec('ROLLBACK');
    throw e;
  }
}
async function declaration(
  person = people[2],
  candidate = candidates[0],
  overrides: Record<string, unknown> = {},
) {
  return (
    await run(editor, 'declaration', {
      election_id: election,
      person_id: person,
      candidate_id: candidate,
      kind: 'support',
      status: 'pending',
      declared_at: '2026-01-01T12:00:00Z',
      source_url: source,
      source_name: 'Entrevista oficial',
      source_published_at: '2026-01-01T12:00:00Z',
      excerpt: 'Declaro explicitamente meu apoio a este candidato.',
      reason: 'Cadastro de evidência pública',
      ...overrides,
    })
  ).id;
}
async function publish(id: string) {
  return run(reviewer, 'review', {
    id,
    version: 1,
    decision: 'publish',
    reason: 'Fonte e identidade conferidas',
  });
}
beforeEach(async () => {
  await pg.exec('DROP SCHEMA IF EXISTS radar CASCADE');
  await pg.exec(await readFile('db/001_initial.sql', 'utf8'));
  for (const a of [admin, editor, reviewer])
    await db.query('INSERT INTO radar.app_users(id,name,email,role) VALUES($1,$2,$3,$4)', [
      a.id,
      a.name,
      a.email,
      a.role,
    ]);
  election = (
    await run(admin, 'election', {
      house: 'camara',
      title: 'Teste 2027',
      seats: 513,
      seats_source: source,
      composition_mode: 'prevista',
      phase: 'draft',
      reason: 'Configuração inicial',
    })
  ).id;
  people = [];
  candidates = [];
  for (let i = 0; i < 4; i++) {
    const p = (
      await run(admin, 'person', {
        house: 'camara',
        origin: 'manual',
        external_id: String(i),
        name: `Pessoa ${i}`,
        party: 'EX',
        uf: 'GO',
        reason: 'Cadastro inicial',
      })
    ).id;
    people.push(p);
    await run(admin, 'roster', {
      election_id: election,
      person_id: p,
      seat_key: `vaga-${i}`,
      eligible: true,
      source_url: source,
      reason: 'Mandato conferido',
    });
  }
  for (let i = 0; i < 2; i++)
    candidates.push(
      (
        await run(admin, 'candidate', {
          election_id: election,
          person_id: people[i],
          status: 'active',
          source_url: source,
          reason: 'Candidatura confirmada',
        })
      ).id,
    );
  const e = (
    await db.query<{ version: number }>('SELECT version FROM radar.elections WHERE id=$1', [
      election,
    ])
  ).rows[0];
  await run(admin, 'election', {
    id: election,
    version: e.version,
    house: 'camara',
    title: 'Teste 2027',
    seats: 513,
    seats_source: source,
    composition_mode: 'prevista',
    phase: 'tracking',
    reason: 'Abrir acompanhamento',
  });
});
after(() => pg.close());

test('publicação documentada entra na lista e na contagem; rascunho não entra', async () => {
  const d = await declaration();
  assert.equal((await publicData(db, 'camara')).supports.length, 0);
  await publish(d);
  const data = await publicData(db, 'camara');
  assert.equal(data.supports.length, 1);
  assert.equal(data.candidates[0].support, 1);
  assert.equal(data.candidates[0].percentage, 100 / 513);
  assert.equal(data.undeclared, 3);
  assert.equal((data.supports[0] as unknown as Record<string, unknown>).notes, undefined);
});
test('troca de apoio é atômica e preserva histórico', async () => {
  const first = await declaration();
  await publish(first);
  const second = await declaration(people[2], candidates[1], {
    declared_at: '2026-01-02T12:00:00Z',
  });
  await publish(second);
  const data = await publicData(db, 'camara');
  assert.equal(data.supports.length, 1);
  assert.equal(data.supports[0].candidate_id, candidates[1]);
  assert.equal(
    (
      await db.query<{ status: string }>('SELECT status FROM radar.declarations WHERE id=$1', [
        first,
      ])
    ).rows[0].status,
    'superseded',
  );
});
test('editor não publica e revisor não altera cadastros', async () => {
  const d = await declaration();
  await assert.rejects(
    run(editor, 'review', { id: d, version: 1, decision: 'publish', reason: 'Teste de acesso' }),
    (e: unknown) => e instanceof AppError && e.status === 403,
  );
  await assert.rejects(
    run(reviewer, 'person', {}),
    (e: unknown) => e instanceof AppError && e.status === 403,
  );
});
test('controle de versão impede sobrescrita e fonte insegura é rejeitada', async () => {
  const d = await declaration();
  await assert.rejects(
    run(reviewer, 'review', { id: d, version: 99, decision: 'publish', reason: 'Versão antiga' }),
    /mudou/,
  );
  await assert.rejects(
    declaration(people[2], candidates[0], { source_url: 'javascript:alert(1)' }),
  );
  await assert.rejects(declaration(people[2], candidates[0], { excerpt: '' }));
});
test('idempotência rejeita mudança de conteúdo e não duplica publicação', async () => {
  const d = await declaration(),
    key = randomUUID(),
    input = { id: d, version: 1, decision: 'publish', reason: 'Fonte verificada' };
  await pg.exec('BEGIN');
  const first = await idempotentCommand(db, reviewer, key, 'review', input);
  await pg.exec('COMMIT');
  await pg.exec('BEGIN');
  const second = await idempotentCommand(db, reviewer, key, 'review', input);
  await pg.exec('COMMIT');
  assert.deepEqual(first, second);
  await assert.rejects(
    idempotentCommand(db, reviewer, key, 'review', { ...input, reason: 'Outro motivo' }),
    /Chave/,
  );
  assert.equal((await publicData(db, 'camara')).supports.length, 1);
});
test('apoio partidário e voto autodeclarado nunca entram na barra', async () => {
  await publish(await declaration(people[2], candidates[0], { kind: 'party' }));
  await publish(await declaration(people[3], candidates[0], { kind: 'self_report' }));
  assert.equal((await publicData(db, 'camara')).supports.length, 0);
});
test('contestação suspende contagem; resolução substitui a pendência', async () => {
  const d = await declaration();
  await publish(d);
  await run(reviewer, 'review', {
    id: d,
    version: 2,
    decision: 'contest',
    reason: 'Duas fontes contraditórias',
  });
  let data = await publicData(db, 'camara');
  assert.equal(data.supports.length, 0);
  assert.equal(data.contested, 1);
  await publish(
    await declaration(people[2], candidates[1], { declared_at: '2026-01-02T12:00:00Z' }),
  );
  data = await publicData(db, 'camara');
  assert.equal(data.contested, 0);
  assert.equal(data.supports.length, 1);
});
test('substituição de ocupante não transfere apoio e vaga duplicada é bloqueada', async () => {
  await publish(await declaration());
  await assert.rejects(
    run(admin, 'roster', {
      election_id: election,
      person_id: people[3],
      seat_key: 'vaga-2',
      eligible: true,
      source_url: source,
      reason: 'Tentativa duplicada',
    }),
  );
  await run(admin, 'roster', {
    election_id: election,
    person_id: people[2],
    seat_key: 'vaga-2',
    eligible: false,
    source_url: source,
    reason: 'Afastamento confirmado',
  });
  assert.equal((await publicData(db, 'camara')).supports.length, 0);
  await assert.rejects(publish(await declaration()), /elegível/);
});
test('retirada de candidato não redistribui seus apoios', async () => {
  await publish(await declaration());
  await run(admin, 'candidate', {
    id: candidates[0],
    version: 1,
    election_id: election,
    person_id: people[0],
    status: 'withdrawn',
    source_url: source,
    reason: 'Retirada confirmada',
  });
  const data = await publicData(db, 'camara');
  assert.equal(data.supports.length, 0);
  assert.equal(data.withdrawnSupport, 1);
  assert.equal(data.undeclared, 3);
});
test('fechamento congela apoio e separa resultado agregado', async () => {
  await publish(await declaration());
  await run(admin, 'result', {
    election_id: election,
    round: 1,
    source_url: source,
    votes: [
      { candidate_id: candidates[0], votes: 3 },
      { candidate_id: candidates[1], votes: 1 },
    ],
    blank: 0,
    invalid: 0,
    total: 4,
    reason: 'Resultado oficial conferido',
  });
  const data = await publicData(db, 'camara');
  assert.equal(data.election?.phase, 'result');
  assert.equal(data.supports.length, 1);
  assert.equal(data.results[0].votes[0].votes, 3);
  await assert.rejects(declaration(), /encerrada/);
});
test('datas anteriores e autoaprovação desativada são bloqueadas', async () => {
  await publish(
    await declaration(people[2], candidates[0], { declared_at: '2026-01-02T12:00:00Z' }),
  );
  await assert.rejects(publish(await declaration()), /anterior/);
  await run(admin, 'settings', {
    self_approval: false,
    correction_url: '',
    reason: 'Revisão independente',
  });
  const d = (
    await run(admin, 'declaration', {
      election_id: election,
      person_id: people[3],
      candidate_id: candidates[0],
      kind: 'support',
      status: 'pending',
      declared_at: '2026-01-01T12:00:00Z',
      source_url: source,
      source_name: 'Fonte',
      source_published_at: '2026-01-01T12:00:00Z',
      excerpt: 'Uma declaração explícita de apoio.',
      reason: 'Cadastro de declaração',
    })
  ).id;
  await assert.rejects(
    run(admin, 'review', {
      id: d,
      version: 1,
      decision: 'publish',
      reason: 'Conferido pelo autor',
    }),
    /outro revisor/,
  );
});
test('importação preserva exceções manuais e não concede elegibilidade', async () => {
  await applyPeople(db, [
    {
      house: 'camara',
      origin: 'camara',
      external_id: '999',
      name: 'Oficial',
      party: 'A',
      uf: 'SP',
      photo_url: '',
    },
  ]);
  await db.query("UPDATE radar.people SET manual_override=true WHERE external_id='999'");
  await applyPeople(db, [
    {
      house: 'camara',
      origin: 'camara',
      external_id: '999',
      name: 'Alterado',
      party: 'B',
      uf: 'SP',
      photo_url: '',
    },
  ]);
  assert.equal(
    (await db.query<{ name: string }>("SELECT name FROM radar.people WHERE external_id='999'"))
      .rows[0].name,
    'Oficial',
  );
  assert.equal((await publicData(db, 'camara')).rosterCount, 4);
});
test('falha de uma página oficial rejeita o lote completo', async () => {
  const fake: typeof fetch = async (input) => {
    if (String(input).includes('pagina=1'))
      return Response.json({
        dados: [{ id: 999, nome: 'Teste', siglaPartido: 'EX', siglaUf: 'SP' }],
        links: [{ rel: 'next', href: 'https://example.com' }],
      });
    return new Response('erro', { status: 503 });
  };
  await assert.rejects(collectOfficial('camara', fake), /503/);
  assert.equal((await db.query('SELECT * FROM radar.people')).rows.length, 4);
});
test('importador Senado normaliza foto e formato esperado', async () => {
  const fake: typeof fetch = async () =>
    Response.json({
      ListaParlamentarEmExercicio: {
        Parlamentares: {
          Parlamentar: [
            {
              IdentificacaoParlamentar: {
                CodigoParlamentar: '9',
                NomeParlamentar: 'Teste',
                SiglaPartidoParlamentar: 'EX',
                UfParlamentar: 'GO',
                UrlFotoParlamentar: 'http://www.senado.leg.br/foto.jpg',
              },
            },
          ],
        },
      },
    });
  const p = await collectOfficial('senado', fake);
  assert.equal(p[0].photo_url, 'https://www.senado.leg.br/foto.jpg');
  assert.equal(p[0].house, 'senado');
});
test('CSV TSE filtra eleitos e não aceita ausência de totalização', () => {
  const csv =
    'SQ_CANDIDATO;NM_URNA_CANDIDATO;SG_PARTIDO;SG_UF;DS_CARGO;DS_SIT_TOT_TURNO\n1;Exemplo;EX;GO;DEPUTADO FEDERAL;ELEITO POR QP\n2;Outro;EX;GO;SENADOR;NÃO ELEITO';
  assert.equal(parseTseCsv(csv).length, 1);
  assert.throws(() => parseTseCsv('id;nome\n1;Teste'), /Nenhum eleito/);
});
test('banco impede leitura direta por papel público e protege último admin', async () => {
  await pg.exec('CREATE ROLE teste_publico');
  await pg.exec('SET ROLE teste_publico');
  await assert.rejects(db.query('SELECT * FROM radar.declarations'), /permission denied/);
  await pg.exec('RESET ROLE');
  await pg.exec('DROP ROLE teste_publico');
  await assert.rejects(
    run(admin, 'user', { ...admin, active: false, reason: 'Desativar acesso' }),
    /último administrador/,
  );
});

test('conciliação preserva apoio e bloqueia composição duplicada', async () => {
  await publish(await declaration());
  const target = (
    await run(admin, 'person', {
      house: 'camara',
      origin: 'camara',
      external_id: '909',
      name: 'Identidade oficial',
      party: 'EX',
      uf: 'GO',
      reason: 'Cadastro oficial',
    })
  ).id;
  await run(admin, 'merge', {
    source_id: people[2],
    target_id: target,
    reason: 'Identidade conferida',
  });
  assert.equal((await publicData(db, 'camara')).supports[0].person_id, target);
  assert.equal(
    (await db.query('SELECT * FROM radar.people WHERE id=$1', [people[2]])).rows.length,
    0,
  );
  await assert.rejects(
    run(admin, 'merge', {
      source_id: people[0],
      target_id: people[1],
      reason: 'Identidade duplicada',
    }),
    /mesma composição/,
  );
});

test('fonte indisponível preserva apoio documentado e exige versão atual', async () => {
  const d = await declaration();
  await publish(d);
  await run(reviewer, 'source', {
    id: d,
    version: 2,
    source_available: false,
    reason: 'Página saiu do ar',
  });
  assert.equal((await publicData(db, 'camara')).supports.length, 1);
  await assert.rejects(
    run(reviewer, 'source', {
      id: d,
      version: 2,
      source_available: true,
      reason: 'Página recuperada',
    }),
    /mudou/,
  );
});
