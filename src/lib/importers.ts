import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import type { DB } from './db';
import type { House } from './types';
import { AppError, publicUrl } from './service';
export type ImportedPerson = {
  house: House;
  external_id: string;
  origin: 'camara' | 'senado' | 'tse';
  name: string;
  party: string;
  uf: string;
  photo_url: string;
};
const imported = z.object({
  house: z.enum(['camara', 'senado']),
  external_id: z.string().min(1).max(100),
  origin: z.enum(['camara', 'senado', 'tse']),
  name: z.string().min(1).max(300),
  party: z.string().min(1).max(100),
  uf: z
    .string()
    .regex(/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/),
  photo_url: z.union([publicUrl, z.literal('')]),
});
function photo(value: unknown) {
  if (typeof value !== 'string' || !value) return '';
  try {
    const u = new URL(value);
    if (['www.camara.leg.br', 'www.senado.leg.br', 'www25.senado.leg.br'].includes(u.hostname))
      u.protocol = 'https:';
    return publicUrl.parse(u.toString());
  } catch {
    return '';
  }
}
async function getJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Fonte oficial retornou HTTP ${response.status}.`);
      const raw = await response.text();
      if (raw.length > 5000000) throw new Error('Resposta oficial excede limite.');
      return JSON.parse(raw);
    } catch (error) {
      last = error;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
    }
  }
  throw last;
}
export async function collectOfficial(
  h: House,
  fetcher: typeof fetch = fetch,
): Promise<ImportedPerson[]> {
  const people: ImportedPerson[] = [];
  if (h === 'camara') {
    for (let page = 1; page <= 100; page++) {
      const json = await getJson(
        `https://dadosabertos.camara.leg.br/api/v2/deputados?itens=100&pagina=${page}&ordem=ASC&ordenarPor=nome`,
        fetcher,
      );
      const parsed = z
        .object({
          dados: z.array(
            z.object({
              id: z.number(),
              nome: z.string(),
              siglaPartido: z.string(),
              siglaUf: z.string(),
              urlFoto: z.string().optional(),
            }),
          ),
          links: z.array(z.object({ rel: z.string(), href: z.string() })),
        })
        .parse(json);
      people.push(
        ...parsed.dados.map((p) =>
          imported.parse({
            house: h,
            origin: h,
            external_id: String(p.id),
            name: p.nome,
            party: p.siglaPartido,
            uf: p.siglaUf,
            photo_url: photo(p.urlFoto),
          }),
        ),
      );
      if (!parsed.links.some((l) => l.rel === 'next')) break;
      if (page === 100) throw new Error('Paginação excedeu limite; lote não aplicado.');
    }
  } else {
    const json = await getJson(
      'https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json',
      fetcher,
    );
    const parsed = z
      .object({
        ListaParlamentarEmExercicio: z.object({
          Parlamentares: z.object({
            Parlamentar: z.array(
              z.object({
                IdentificacaoParlamentar: z.object({
                  CodigoParlamentar: z.string(),
                  NomeParlamentar: z.string(),
                  SiglaPartidoParlamentar: z.string(),
                  UfParlamentar: z.string(),
                  UrlFotoParlamentar: z.string().optional(),
                }),
              }),
            ),
          }),
        }),
      })
      .parse(json);
    people.push(
      ...parsed.ListaParlamentarEmExercicio.Parlamentares.Parlamentar.map(
        ({ IdentificacaoParlamentar: p }) =>
          imported.parse({
            house: h,
            origin: h,
            external_id: p.CodigoParlamentar,
            name: p.NomeParlamentar,
            party: p.SiglaPartidoParlamentar,
            uf: p.UfParlamentar,
            photo_url: photo(p.UrlFotoParlamentar),
          }),
      ),
    );
  }
  if (
    !people.length ||
    new Set(people.map((p) => `${p.origin}:${p.external_id}`)).size !== people.length
  )
    throw new AppError('Lote vazio ou com identificadores duplicados; nada foi aplicado.');
  return people;
}
export async function applyPeople(db: DB, people: ImportedPerson[]) {
  for (const p of people) {
    imported.parse(p);
    const alias = (
      await db.query<{ person_id: string }>(
        'SELECT person_id FROM radar.person_aliases WHERE origin=$1 AND external_id=$2',
        [p.origin, p.external_id],
      )
    ).rows[0];
    if (alias) {
      // Aliases only identify a person; an older TSE import must not overwrite current congressional data.
      if (p.origin !== 'tse')
        await db.query(
          'UPDATE radar.people SET name=$2,party=$3,uf=$4,photo_url=$5,version=version+1,updated_at=now() WHERE id=$1 AND NOT manual_override',
          [alias.person_id, p.name, p.party, p.uf, p.photo_url],
        );
      continue;
    }
    await db.query(
      `INSERT INTO radar.people(house,external_id,origin,name,party,uf,photo_url) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(origin,external_id) DO UPDATE SET name=EXCLUDED.name,party=EXCLUDED.party,uf=EXCLUDED.uf,photo_url=EXCLUDED.photo_url,version=radar.people.version+1,updated_at=now() WHERE NOT radar.people.manual_override AND radar.people.house=EXCLUDED.house`,
      [p.house, p.external_id, p.origin, p.name, p.party, p.uf, p.photo_url],
    );
  }
}
// Assisted TSE import deliberately does not merge identities by name or grant eligibility.
export function parseTseCsv(raw: string): ImportedPerson[] {
  const rows = parse(raw, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    delimiter: ';',
    max_record_size: 10000,
  }) as Record<string, string>[];
  if (!rows.length || rows.length > 2000)
    throw new AppError('Importe de 1 a 2.000 registros por arquivo.');
  const elected = ['ELEITO', 'ELEITO POR QP', 'ELEITO POR MÉDIA'];
  const output = rows
    .filter(
      (r) =>
        elected.includes(r.DS_SIT_TOT_TURNO?.trim().toUpperCase()) &&
        ['DEPUTADO FEDERAL', 'SENADOR'].includes(r.DS_CARGO?.trim().toUpperCase()),
    )
    .map((r) =>
      imported.parse({
        house: r.DS_CARGO.trim().toUpperCase() === 'SENADOR' ? 'senado' : 'camara',
        origin: 'tse',
        external_id: r.SQ_CANDIDATO,
        name: r.NM_URNA_CANDIDATO || r.NM_CANDIDATO,
        party: r.SG_PARTIDO,
        uf: r.SG_UF,
        photo_url: '',
      }),
    );
  if (!output.length)
    throw new AppError(
      'Nenhum eleito para Câmara ou Senado localizado. Confira as colunas oficiais e a codificação UTF-8.',
    );
  if (new Set(output.map((p) => p.external_id)).size !== output.length)
    throw new AppError('Arquivo contém identificadores duplicados.');
  return output;
}
