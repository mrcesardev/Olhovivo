import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { DB } from './db';
import type {
  Actor,
  AdminData,
  Candidate,
  Declaration,
  Election,
  House,
  OfficialResult,
  Person,
  PublicData,
  Support,
} from './types';

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const id = z.string().uuid();
const text = z.string().trim().min(1).max(300);
export const publicUrl = z
  .string()
  .max(2000)
  .url()
  .refine((v) => {
    try {
      const u = new URL(v);
      return (
        u.protocol === 'https:' &&
        !u.username &&
        !u.password &&
        u.hostname.includes('.') &&
        !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname)
      );
    } catch {
      return false;
    }
  }, 'Informe um link público HTTPS.');
const date = z
  .string()
  .datetime({ offset: true })
  .refine((v) => Date.parse(v) <= Date.now() + 60000, 'Data futura não permitida.');
const house = z.enum(['camara', 'senado']);
const optionalId = id.optional();
const version = z.number().int().positive().optional();
const reason = z.string().trim().min(5, 'Explique o motivo com pelo menos 5 caracteres.').max(2000);
const UF = z.enum([
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]);
export const personInput = z.object({
  id: optionalId,
  version,
  house,
  external_id: text,
  origin: z.enum(['manual', 'tse', 'camara', 'senado']),
  name: text,
  party: text,
  uf: UF,
  photo_url: z.union([publicUrl, z.literal('')]).default(''),
  manual_override: z.boolean().default(true),
  reason,
});
const electionInput = z.object({
  id: optionalId,
  version,
  house,
  title: text,
  seats: z.number().int().min(1).max(1000),
  seats_source: publicUrl,
  composition_mode: z.enum(['prevista', 'exercicio']),
  phase: z.enum(['draft', 'tracking', 'result', 'archived']),
  reason,
});
const rosterInput = z.object({
  election_id: id,
  person_id: id,
  seat_key: text,
  eligible: z.boolean(),
  source_url: publicUrl,
  reason,
});
const candidateInput = z.object({
  id: optionalId,
  version,
  election_id: id,
  person_id: id,
  status: z.enum(['active', 'withdrawn']),
  source_url: publicUrl,
  reason,
});
const declarationInput = z.object({
  id: optionalId,
  version,
  election_id: id,
  person_id: id,
  candidate_id: id.nullable(),
  kind: z.enum(['support', 'neutral', 'party', 'self_report']),
  status: z.enum(['draft', 'pending']),
  declared_at: date,
  source_url: publicUrl,
  source_name: text,
  source_published_at: date,
  excerpt: z.string().trim().min(10).max(3000),
  notes: z.string().max(2000).default(''),
  reason,
});
const reviewInput = z.object({
  id,
  version: z.number().int().positive(),
  decision: z.enum(['publish', 'return', 'reject', 'withdraw', 'contest']),
  reason,
});
const resultInput = z.object({
  election_id: id,
  round: z.number().int().min(1).max(5),
  source_url: publicUrl,
  votes: z.array(z.object({ candidate_id: id, votes: z.number().int().nonnegative() })).min(1),
  blank: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  reason,
});

function allow(actor: Actor, roles: string[]) {
  if (!actor.active || !roles.includes(actor.role))
    throw new AppError('Você não tem permissão para esta ação.', 403);
}
async function one<T>(db: DB, sql: string, args: unknown[]): Promise<T> {
  const r = await db.query<T>(sql, args);
  if (!r.rows[0]) throw new AppError('Registro não encontrado.', 404);
  return r.rows[0];
}
async function record<T>(db: DB, table: string, key: string): Promise<T> {
  return one<T>(db, `SELECT * FROM radar.${table} WHERE id=$1`, [key]);
}
async function log(
  db: DB,
  actor: Actor,
  action: string,
  entity: string,
  before: unknown,
  after: unknown,
  why: string,
) {
  await db.query(
    'INSERT INTO radar.audit(actor_id,action,entity_id,before_data,after_data,reason) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)',
    [actor.id, action, entity, JSON.stringify(before ?? null), JSON.stringify(after ?? null), why],
  );
}
function checkVersion(old: { version: number }, proposed: number | undefined) {
  if (old.version !== proposed)
    throw new AppError('Este registro mudou. Atualize o painel antes de salvar.', 409);
}
async function editableElection(db: DB, key: string) {
  const e = await record<Election>(db, 'elections', key);
  if (['result', 'archived'].includes(e.phase))
    throw new AppError('Esta disputa está encerrada para alterações de apoio.');
  return e;
}
async function personInHouse(db: DB, key: string, h: House) {
  const p = await record<Person>(db, 'people', key);
  if (p.house !== h) throw new AppError('O parlamentar pertence a outra Casa.');
  return p;
}
async function touch(db: DB, key: string) {
  await db.query('UPDATE radar.elections SET version=version+1,updated_at=now() WHERE id=$1', [
    key,
  ]);
}

export async function publicData(db: DB, h: House): Promise<PublicData> {
  const election = (
    await db.query<Election & { closed_snapshot: PublicData | null }>(
      "SELECT * FROM radar.elections WHERE house=$1 AND phase<>'draft' ORDER BY CASE phase WHEN 'tracking' THEN 0 WHEN 'result' THEN 1 ELSE 2 END,updated_at DESC LIMIT 1",
      [h],
    )
  ).rows[0];
  const settings = (
    await db.query<{ correction_url: string }>(
      'SELECT correction_url FROM radar.settings WHERE id=1',
    )
  ).rows[0];
  const sync = (
    await db.query<{ finished_at: string }>(
      "SELECT finished_at FROM radar.sync_runs WHERE house=$1 AND status='success' ORDER BY finished_at DESC LIMIT 1",
      [h],
    )
  ).rows[0];
  const empty: PublicData = {
    demo: false,
    election: null,
    candidates: [],
    supports: [],
    rosterCount: 0,
    undeclared: 0,
    neutral: 0,
    contested: 0,
    withdrawnSupport: 0,
    updatedAt: null,
    syncAt: sync?.finished_at ?? null,
    correctionUrl: settings?.correction_url ?? '',
    results: [],
  };
  if (!election) return empty;
  const results = (
    await db.query<OfficialResult>(
      'SELECT * FROM radar.results WHERE election_id=$1 ORDER BY round',
      [election.id],
    )
  ).rows;
  const { closed_snapshot, ...publicElection } = election;
  if (closed_snapshot && ['result', 'archived'].includes(election.phase))
    return {
      ...closed_snapshot,
      election: publicElection,
      results,
      correctionUrl: empty.correctionUrl,
    };
  const candidates = (
    await db.query<Candidate>(
      `SELECT c.*,p.name,p.party,p.uf,p.photo_url FROM radar.candidates c JOIN radar.people p ON p.id=c.person_id WHERE election_id=$1 ORDER BY p.name`,
      [election.id],
    )
  ).rows;
  const positions = (
    await db.query<Support & { kind: string; status: string; candidate_status: string }>(
      `SELECT d.id,d.person_id,d.candidate_id,d.kind,d.status,d.declared_at,d.source_url,d.source_name,d.excerpt,p.name,p.party,p.uf,c.status AS candidate_status FROM radar.declarations d JOIN radar.people p ON p.id=d.person_id JOIN radar.roster r ON r.person_id=p.id AND r.election_id=d.election_id LEFT JOIN radar.candidates c ON c.id=d.candidate_id WHERE d.election_id=$1 AND r.eligible AND d.status IN ('published','contested') AND d.kind IN ('support','neutral') ORDER BY d.updated_at DESC`,
      [election.id],
    )
  ).rows;
  // A contested historical record does not shadow a newer resolved published position.
  const latest = new Map<string, (typeof positions)[number]>();
  for (const d of positions) if (!latest.has(d.person_id)) latest.set(d.person_id, d);
  const rows = [...latest.values()];
  const supports = rows.filter(
    (d) => d.status === 'published' && d.kind === 'support' && d.candidate_status === 'active',
  );
  const rosterCount = Number(
    (
      await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM radar.roster WHERE election_id=$1 AND eligible',
        [election.id],
      )
    ).rows[0].n,
  );
  for (const c of candidates) {
    c.support = supports.filter((d) => d.candidate_id === c.id).length;
    c.percentage = (100 * c.support) / election.seats;
  }
  candidates.sort((a, b) => b.support - a.support || a.name.localeCompare(b.name, 'pt-BR'));
  return {
    ...empty,
    election: publicElection,
    candidates,
    supports,
    results,
    rosterCount,
    undeclared: rosterCount - latest.size,
    neutral: rows.filter((d) => d.status === 'published' && d.kind === 'neutral').length,
    contested: rows.filter((d) => d.status === 'contested').length,
    withdrawnSupport: rows.filter(
      (d) => d.status === 'published' && d.candidate_status === 'withdrawn',
    ).length,
    updatedAt: election.updated_at,
  };
}

export async function adminData(db: DB, actor: Actor): Promise<AdminData> {
  allow(actor, ['editor', 'reviewer', 'admin']);
  const people = (await db.query<Person>('SELECT * FROM radar.people ORDER BY name')).rows;
  const elections = (
    await db.query<Election>(
      'SELECT id,house,title,seats,seats_source,composition_mode,phase,version,updated_at FROM radar.elections ORDER BY updated_at DESC',
    )
  ).rows;
  const candidates = (
    await db.query<Candidate>(
      'SELECT c.*,p.name,p.party,p.uf,p.photo_url FROM radar.candidates c JOIN radar.people p ON p.id=c.person_id ORDER BY p.name',
    )
  ).rows;
  const declarations = (
    await db.query<Declaration>(
      `SELECT d.*,p.name,p.party,p.uf,cp.name AS candidate_name FROM radar.declarations d JOIN radar.people p ON p.id=d.person_id LEFT JOIN radar.candidates c ON c.id=d.candidate_id LEFT JOIN radar.people cp ON cp.id=c.person_id ORDER BY d.updated_at DESC LIMIT 3000`,
    )
  ).rows;
  const roster = (await db.query<AdminData['roster'][number]>('SELECT * FROM radar.roster')).rows;
  const audit = (
    await db.query<AdminData['audit'][number]>(
      'SELECT * FROM radar.audit WHERE ($1::uuid IS NULL OR actor_id=$1) ORDER BY created_at DESC LIMIT 200',
      [actor.role === 'editor' ? actor.id : null],
    )
  ).rows;
  const sync = (
    await db.query<AdminData['sync'][number]>(
      'SELECT * FROM radar.sync_runs ORDER BY started_at DESC LIMIT 20',
    )
  ).rows;
  const settings = (
    await db.query<AdminData['settings']>(
      'SELECT self_approval,correction_url FROM radar.settings WHERE id=1',
    )
  ).rows[0];
  const users =
    actor.role === 'admin'
      ? (await db.query<Actor>('SELECT * FROM radar.app_users ORDER BY name')).rows
      : [];
  const results = (await db.query<OfficialResult>('SELECT * FROM radar.results ORDER BY round'))
    .rows;
  return {
    actor,
    people,
    elections,
    candidates,
    declarations,
    roster,
    audit,
    sync,
    settings,
    users,
    results,
  };
}

export async function command(
  db: DB,
  actor: Actor,
  action: string,
  input: unknown,
): Promise<{ id: string }> {
  const current = (
    await db.query<Actor>('SELECT * FROM radar.app_users WHERE id=$1 AND active', [actor.id])
  ).rows[0];
  if (!current) throw new AppError('Acesso revogado.', 403);
  actor = current;
  allow(actor, ['editor', 'reviewer', 'admin']);
  if (action === 'person') {
    allow(actor, ['admin']);
    const d = personInput.parse(input);
    let old: Person | null = null;
    if (d.id) {
      old = await record<Person>(db, 'people', d.id);
      checkVersion(old, d.version);
      if (old.house !== d.house || old.origin !== d.origin || old.external_id !== d.external_id)
        throw new AppError('Casa e identidade de origem são imutáveis.');
    }
    const values = [
      d.house,
      d.external_id,
      d.origin,
      d.name,
      d.party,
      d.uf,
      d.photo_url,
      d.manual_override,
    ];
    const r = d.id
      ? await db.query<{ id: string }>(
          'UPDATE radar.people SET name=$4,party=$5,uf=$6,photo_url=$7,manual_override=$8,version=version+1,updated_at=now() WHERE id=$9 AND house=$1 AND external_id=$2 AND origin=$3 RETURNING id',
          [...values, d.id],
        )
      : await db.query<{ id: string }>(
          'INSERT INTO radar.people(house,external_id,origin,name,party,uf,photo_url,manual_override) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
          values,
        );
    await db.query(
      "UPDATE radar.elections SET version=version+1,updated_at=now() WHERE house=$1 AND phase='tracking'",
      [d.house],
    );
    await log(db, actor, action, r.rows[0].id, old, d, d.reason);
    return r.rows[0];
  }
  if (action === 'election') {
    allow(actor, ['admin']);
    const d = electionInput.parse(input);
    let old: Election | null = null;
    if (d.id) {
      old = await record<Election>(db, 'elections', d.id);
      checkVersion(old, d.version);
      if (old.house !== d.house) throw new AppError('A Casa da disputa é imutável.');
      if (['result', 'archived'].includes(old.phase)) {
        if (
          d.phase !== 'archived' ||
          d.seats !== old.seats ||
          d.title !== old.title ||
          d.seats_source !== old.seats_source ||
          d.composition_mode !== old.composition_mode
        )
          throw new AppError('Após o resultado, somente o arquivamento é permitido.');
      }
      const n = Number(
        (
          await db.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM radar.roster WHERE election_id=$1 AND eligible',
            [d.id],
          )
        ).rows[0].n,
      );
      if (n > d.seats) throw new AppError('O total de cadeiras é menor que a composição elegível.');
      if (d.phase === 'tracking' && n === 0)
        throw new AppError('Cadastre e revise a composição antes de abrir a disputa.');
    } else if (d.phase !== 'draft')
      throw new AppError('Crie a disputa como rascunho antes de cadastrar a composição.');
    if (d.phase === 'result' && old?.phase !== 'result')
      throw new AppError('Use Registrar resultado para encerrar a disputa.');
    if (old?.phase === 'tracking' && d.phase === 'draft')
      throw new AppError('Uma disputa publicada não pode voltar a rascunho.');
    if (old && d.phase === 'archived' && old.phase === 'tracking') {
      const snapshot = await publicData(db, old.house);
      await db.query('UPDATE radar.elections SET closed_snapshot=$2::jsonb WHERE id=$1', [
        old.id,
        JSON.stringify(snapshot),
      ]);
    }
    const values = [d.house, d.title, d.seats, d.seats_source, d.composition_mode, d.phase];
    const r = d.id
      ? await db.query<{ id: string }>(
          'UPDATE radar.elections SET title=$2,seats=$3,seats_source=$4,composition_mode=$5,phase=$6,version=version+1,updated_at=now() WHERE id=$7 AND house=$1 RETURNING id',
          [...values, d.id],
        )
      : await db.query<{ id: string }>(
          'INSERT INTO radar.elections(house,title,seats,seats_source,composition_mode,phase) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          values,
        );
    await log(db, actor, action, r.rows[0].id, old, d, d.reason);
    return r.rows[0];
  }
  if (action === 'merge') {
    allow(actor, ['admin']);
    const d = z.object({ source_id: id, target_id: id, reason }).parse(input);
    if (d.source_id === d.target_id) throw new AppError('Selecione duas identidades diferentes.');
    const source = await record<Person>(db, 'people', d.source_id),
      target = await record<Person>(db, 'people', d.target_id);
    if (source.house !== target.house)
      throw new AppError('As identidades pertencem a Casas diferentes.');
    const overlapping = (
      await db.query(
        'SELECT 1 FROM radar.roster a JOIN radar.roster b ON a.election_id=b.election_id WHERE a.person_id=$1 AND b.person_id=$2',
        [source.id, target.id],
      )
    ).rows.length;
    if (overlapping)
      throw new AppError(
        'As duas identidades já estão na mesma composição. Corrija a duplicidade antes de conciliar.',
      );
    await db.query('UPDATE radar.roster SET person_id=$2 WHERE person_id=$1', [
      source.id,
      target.id,
    ]);
    await db.query('UPDATE radar.candidates SET person_id=$2 WHERE person_id=$1', [
      source.id,
      target.id,
    ]);
    await db.query('UPDATE radar.declarations SET person_id=$2 WHERE person_id=$1', [
      source.id,
      target.id,
    ]);
    await db.query('UPDATE radar.person_aliases SET person_id=$2 WHERE person_id=$1', [
      source.id,
      target.id,
    ]);
    await db.query(
      'INSERT INTO radar.person_aliases(origin,external_id,person_id) VALUES($1,$2,$3)',
      [source.origin, source.external_id, target.id],
    );
    await db.query('DELETE FROM radar.people WHERE id=$1', [source.id]);
    await db.query(
      "UPDATE radar.elections SET version=version+1,updated_at=now() WHERE house=$1 AND phase='tracking'",
      [target.house],
    );
    await log(db, actor, action, target.id, { source, target }, { canonical: target.id }, d.reason);
    return { id: target.id };
  }
  if (action === 'roster') {
    allow(actor, ['admin']);
    const d = rosterInput.parse(input);
    const e = await editableElection(db, d.election_id);
    await personInHouse(db, d.person_id, e.house);
    const old = (
      await db.query('SELECT * FROM radar.roster WHERE election_id=$1 AND person_id=$2', [
        d.election_id,
        d.person_id,
      ])
    ).rows[0];
    // Replacing a seat occupant is an explicit operation: first disable the old occupant.
    await db.query(
      'INSERT INTO radar.roster(election_id,person_id,seat_key,eligible,source_url) VALUES($1,$2,$3,$4,$5) ON CONFLICT(election_id,person_id) DO UPDATE SET seat_key=$3,eligible=$4,source_url=$5',
      [d.election_id, d.person_id, d.seat_key, d.eligible, d.source_url],
    );
    const n = Number(
      (
        await db.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM radar.roster WHERE election_id=$1 AND eligible',
          [e.id],
        )
      ).rows[0].n,
    );
    if (n > e.seats) throw new AppError('A composição ultrapassa o total de cadeiras.');
    await touch(db, e.id);
    await log(db, actor, action, d.person_id, old, d, d.reason);
    return { id: d.person_id };
  }
  if (action === 'candidate') {
    allow(actor, ['admin']);
    const d = candidateInput.parse(input);
    const e = await editableElection(db, d.election_id);
    await personInHouse(db, d.person_id, e.house);
    const member = (
      await db.query(
        'SELECT 1 FROM radar.roster WHERE election_id=$1 AND person_id=$2 AND eligible',
        [e.id, d.person_id],
      )
    ).rows.length;
    if (!member) throw new AppError('O candidato precisa integrar a composição elegível.');
    let old: Candidate | null = null;
    if (d.id) {
      old = await record<Candidate>(db, 'candidates', d.id);
      checkVersion(old, d.version);
      if (old.election_id !== e.id || old.person_id !== d.person_id)
        throw new AppError('Identidade da candidatura é imutável.');
    }
    const r = d.id
      ? await db.query<{ id: string }>(
          'UPDATE radar.candidates SET status=$2,source_url=$3,version=version+1 WHERE id=$1 RETURNING id',
          [d.id, d.status, d.source_url],
        )
      : await db.query<{ id: string }>(
          'INSERT INTO radar.candidates(election_id,person_id,status,source_url) VALUES($1,$2,$3,$4) RETURNING id',
          [e.id, d.person_id, d.status, d.source_url],
        );
    await touch(db, e.id);
    await log(db, actor, action, r.rows[0].id, old, d, d.reason);
    return r.rows[0];
  }
  if (action === 'declaration') {
    const d = declarationInput.parse(input);
    const e = await editableElection(db, d.election_id);
    const p = await personInHouse(db, d.person_id, e.house);
    if ((d.kind === 'neutral' && d.candidate_id) || (d.kind !== 'neutral' && !d.candidate_id))
      throw new AppError('Selecione um candidato para este tipo de declaração.');
    if (d.candidate_id) {
      const c = await record<Candidate>(db, 'candidates', d.candidate_id);
      if (c.election_id !== e.id || c.status !== 'active')
        throw new AppError('Candidato inválido ou retirado.');
    }
    let old: Declaration | null = null;
    if (d.id) {
      old = await record<Declaration>(db, 'declarations', d.id);
      checkVersion(old, d.version);
      if (!['draft', 'returned'].includes(old.status))
        throw new AppError(
          'Crie uma nova declaração para corrigir um registro publicado ou em revisão.',
        );
      if (actor.role === 'editor' && old.author_id !== actor.id)
        throw new AppError('Você só pode editar seus rascunhos.', 403);
      if (old.election_id !== e.id || old.person_id !== p.id)
        throw new AppError('Identidade da declaração é imutável.');
    }
    const values = [
      e.id,
      p.id,
      d.candidate_id,
      d.kind,
      d.status,
      d.declared_at,
      d.source_url,
      d.source_name,
      d.source_published_at,
      d.excerpt,
      p.party,
      d.notes,
    ];
    const r = d.id
      ? await db.query<{ id: string }>(
          'UPDATE radar.declarations SET candidate_id=$3,kind=$4,status=$5,declared_at=$6,source_url=$7,source_name=$8,source_published_at=$9,excerpt=$10,party_at_declaration=$11,notes=$12,version=version+1,updated_at=now() WHERE id=$13 AND election_id=$1 AND person_id=$2 RETURNING id',
          [...values, d.id],
        )
      : await db.query<{ id: string }>(
          'INSERT INTO radar.declarations(election_id,person_id,candidate_id,kind,status,declared_at,source_url,source_name,source_published_at,excerpt,party_at_declaration,notes,author_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id',
          [...values, actor.id],
        );
    await log(db, actor, action, r.rows[0].id, old, d, d.reason);
    return r.rows[0];
  }
  if (action === 'review') {
    allow(actor, ['admin', 'reviewer']);
    const d = reviewInput.parse(input);
    const old = await record<Declaration>(db, 'declarations', d.id);
    checkVersion(old, d.version);
    const e = await editableElection(db, old.election_id);
    const settings = (
      await db.query<{ self_approval: boolean }>(
        'SELECT self_approval FROM radar.settings WHERE id=1',
      )
    ).rows[0];
    if (d.decision === 'publish') {
      if (old.status !== 'pending')
        throw new AppError('Somente registros em revisão podem ser publicados.');
      if (old.author_id === actor.id && (!settings.self_approval || actor.role !== 'admin'))
        throw new AppError('Esta revisão precisa de outro revisor.', 403);
      if (
        !(
          await db.query(
            'SELECT 1 FROM radar.roster WHERE election_id=$1 AND person_id=$2 AND eligible',
            [e.id, old.person_id],
          )
        ).rows.length
      )
        throw new AppError('O parlamentar não está elegível nesta composição.');
      if (old.candidate_id) {
        const c = await record<Candidate>(db, 'candidates', old.candidate_id);
        if (c.status !== 'active' || c.election_id !== e.id)
          throw new AppError('Candidato indisponível.');
      }
      if (['support', 'neutral'].includes(old.kind)) {
        const previous = (
          await db.query<Declaration>(
            "SELECT * FROM radar.declarations WHERE election_id=$1 AND person_id=$2 AND status IN ('published','contested') AND kind IN ('support','neutral') ORDER BY declared_at DESC LIMIT 1",
            [e.id, old.person_id],
          )
        ).rows[0];
        if (previous && new Date(old.declared_at) < new Date(previous.declared_at))
          throw new AppError(
            'A declaração é anterior ao posicionamento vigente. Revise as datas antes de substituir.',
          );
        await db.query(
          "UPDATE radar.declarations SET status='superseded',version=version+1,updated_at=now() WHERE election_id=$1 AND person_id=$2 AND status IN ('published','contested') AND kind IN ('support','neutral')",
          [e.id, old.person_id],
        );
      }
    } else if (['withdraw', 'contest'].includes(d.decision)) {
      if (old.status !== 'published')
        throw new AppError('Somente publicação vigente pode ser retirada ou contestada.');
    } else if (old.status !== 'pending')
      throw new AppError('Somente registros em revisão podem ser devolvidos ou rejeitados.');
    const status = {
      publish: 'published',
      return: 'returned',
      reject: 'rejected',
      withdraw: 'withdrawn',
      contest: 'contested',
    }[d.decision];
    await db.query(
      'UPDATE radar.declarations SET status=$2,reviewer_id=$3,version=version+1,updated_at=now() WHERE id=$1',
      [d.id, status, actor.id],
    );
    await touch(db, e.id);
    await log(db, actor, `review:${d.decision}`, d.id, old, { status }, d.reason);
    return { id: d.id };
  }
  if (action === 'settings') {
    allow(actor, ['admin']);
    const d = z
      .object({
        self_approval: z.boolean(),
        correction_url: z.union([publicUrl, z.literal('')]),
        reason,
      })
      .parse(input);
    const old = (await db.query('SELECT * FROM radar.settings WHERE id=1')).rows[0];
    await db.query('UPDATE radar.settings SET self_approval=$1,correction_url=$2 WHERE id=1', [
      d.self_approval,
      d.correction_url,
    ]);
    await log(db, actor, action, '1', old, d, d.reason);
    return { id: '1' };
  }
  if (action === 'source') {
    allow(actor, ['admin', 'reviewer']);
    const d = z
      .object({ id, version: z.number().int().positive(), source_available: z.boolean(), reason })
      .parse(input);
    const old = await record<Declaration>(db, 'declarations', d.id);
    checkVersion(old, d.version);
    await db.query(
      'UPDATE radar.declarations SET source_available=$2,version=version+1 WHERE id=$1',
      [d.id, d.source_available],
    );
    await log(db, actor, action, d.id, { source_available: old.source_available }, d, d.reason);
    return { id: d.id };
  }
  if (action === 'user') {
    allow(actor, ['admin']);
    const d = z
      .object({
        id,
        email: z.email(),
        name: text,
        role: z.enum(['editor', 'reviewer', 'admin']),
        active: z.boolean(),
        reason,
      })
      .parse(input);
    const old = (await db.query<Actor>('SELECT * FROM radar.app_users WHERE id=$1', [d.id]))
      .rows[0];
    if (old?.active && old.role === 'admin' && (!d.active || d.role !== 'admin')) {
      const n = Number(
        (
          await db.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM radar.app_users WHERE role='admin' AND active",
          )
        ).rows[0].n,
      );
      if (n <= 1) throw new AppError('Não é possível remover o último administrador ativo.');
    }
    await db.query(
      'INSERT INTO radar.app_users(id,email,name,role,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET email=$2,name=$3,role=$4,active=$5',
      [d.id, d.email, d.name, d.role, d.active],
    );
    await log(db, actor, action, d.id, old, d, d.reason);
    return { id: d.id };
  }
  if (action === 'result') {
    allow(actor, ['admin', 'reviewer']);
    const d = resultInput.parse(input);
    const e = await record<Election>(db, 'elections', d.election_id);
    if (!['tracking', 'result'].includes(e.phase))
      throw new AppError('A disputa não está aberta para resultados.');
    if (
      d.total > e.seats ||
      new Set(d.votes.map((v) => v.candidate_id)).size !== d.votes.length ||
      d.votes.reduce((n, v) => n + v.votes, 0) + d.blank + d.invalid !== d.total
    )
      throw new AppError('Os totais do resultado não conferem.');
    for (const v of d.votes) {
      const c = await record<Candidate>(db, 'candidates', v.candidate_id);
      if (c.election_id !== e.id) throw new AppError('Candidato de outra disputa.');
    }
    if (e.phase === 'tracking') {
      const snapshot = await publicData(db, e.house);
      await db.query('UPDATE radar.elections SET closed_snapshot=$2::jsonb WHERE id=$1', [
        e.id,
        JSON.stringify(snapshot),
      ]);
    }
    const old = (
      await db.query('SELECT * FROM radar.results WHERE election_id=$1 AND round=$2', [
        e.id,
        d.round,
      ])
    ).rows[0];
    const r = await db.query<{ id: string }>(
      'INSERT INTO radar.results(election_id,round,source_url,votes,blank,invalid,total) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7) ON CONFLICT(election_id,round) DO UPDATE SET source_url=$3,votes=$4::jsonb,blank=$5,invalid=$6,total=$7 RETURNING id',
      [e.id, d.round, d.source_url, JSON.stringify(d.votes), d.blank, d.invalid, d.total],
    );
    await db.query(
      "UPDATE radar.elections SET phase='result',version=version+1,updated_at=now() WHERE id=$1",
      [e.id],
    );
    await log(db, actor, action, r.rows[0].id, old, d, d.reason);
    return r.rows[0];
  }
  throw new AppError('Operação desconhecida.');
}

// Call inside a transaction holding the editorial advisory lock.
export async function idempotentCommand(
  db: DB,
  actor: Actor,
  key: string,
  action: string,
  input: unknown,
) {
  id.parse(key);
  const hash = createHash('sha256').update(JSON.stringify({ action, input })).digest('hex');
  const previous = (
    await db.query<{ actor_id: string; payload_hash: string; response: { id: string } }>(
      'SELECT * FROM radar.requests WHERE key=$1',
      [key],
    )
  ).rows[0];
  if (previous) {
    if (previous.actor_id !== actor.id || previous.payload_hash !== hash)
      throw new AppError('Chave de requisição já utilizada com outro conteúdo.', 409);
    return previous.response;
  }
  const response = await command(db, actor, action, input);
  await db.query(
    'INSERT INTO radar.requests(key,actor_id,payload_hash,response) VALUES($1,$2,$3,$4::jsonb)',
    [key, actor.id, hash, JSON.stringify(response)],
  );
  return response;
}
