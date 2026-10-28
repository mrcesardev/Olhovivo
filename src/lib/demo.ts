import type { AdminData, Candidate, House, Person, PublicData, Support } from './types';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const names = [
  'Ana Martins',
  'Pedro Nascimento',
  'Carla Ribeiro',
  'Lucas Ferreira',
  'Beatriz Santos',
  'Mariana Lopes',
  'Gabriel Souza',
  'Camila Mendes',
  'Rafael Lima',
  'Sofia Carvalho',
  'Bruno Rocha',
  'Laura Fernandes',
];
export function demoPeople(h: House): Person[] {
  const base = h === 'camara' ? 0 : 1000;
  return Array.from({ length: h === 'camara' ? 513 : 81 }, (_, i) => ({
    id: uuid(base + i + 1),
    house: h,
    name:
      i < 3
        ? (h === 'camara'
            ? ['Ricardo Almeida', 'Helena Costa', 'Marcos Oliveira']
            : ['Clara Monteiro', 'Eduardo Vieira', 'Teresa Duarte'])[i]
        : `${names[(i - 3) % names.length]}${i > 14 ? ` • Exemplo ${i - 2}` : ''}`,
    party: `Partido ${['A', 'B', 'C'][i % 3]}`,
    uf: ['SP', 'MG', 'GO', 'BA', 'PR', 'RJ'][i % 6],
    photo_url: '',
    external_id: `demo-${base + i}`,
    origin: 'manual',
    manual_override: true,
    version: 1,
  }));
}
export function demoData(h: House): PublicData {
  const people = demoPeople(h),
    electionId = uuid(h === 'camara' ? 3000 : 3001),
    counts = h === 'camara' ? [231, 154, 77] : [36, 22, 11];
  const candidates: Candidate[] = people
    .slice(0, 3)
    .map((p, i) => ({
      ...p,
      id: uuid((h === 'camara' ? 4000 : 5000) + i),
      person_id: p.id,
      election_id: electionId,
      status: 'active',
      source_url: 'https://example.com/candidatura',
      support: counts[i],
      percentage: (100 * counts[i]) / people.length,
    }));
  let offset = 0;
  const supports: Support[] = [];
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < counts[c]; i++) {
      const p = people[offset++];
      supports.push({
        id: uuid((h === 'camara' ? 6000 : 7000) + offset),
        person_id: p.id,
        candidate_id: candidates[c].id,
        name: p.name,
        party: p.party,
        uf: p.uf,
        declared_at: '2026-10-27T15:00:00.000Z',
        source_url: 'https://example.com',
        source_name: 'Fonte ilustrativa',
        excerpt: 'Declaração fictícia criada exclusivamente para demonstrar a interface.',
      });
    }
  }
  return {
    demo: true,
    election: {
      id: electionId,
      house: h,
      title: 'Presidência • Biênio 2027–2028',
      seats: people.length,
      seats_source: 'https://example.com',
      composition_mode: 'prevista',
      phase: 'tracking',
      version: 1,
      updated_at: '2026-10-27T18:00:00.000Z',
    },
    candidates,
    supports,
    rosterCount: people.length,
    undeclared: people.length - supports.length,
    neutral: 0,
    contested: 0,
    withdrawnSupport: 0,
    updatedAt: '2026-10-27T18:00:00.000Z',
    syncAt: null,
    correctionUrl: '',
    results: [],
  };
}
export function demoAdmin(): AdminData {
  const a = demoData('camara'),
    b = demoData('senado'),
    people = [...demoPeople('camara'), ...demoPeople('senado')];
  const actor = {
    id: uuid(9999),
    name: 'Equipe editorial',
    email: 'demo@example.com',
    role: 'admin' as const,
    active: true,
  };
  return {
    actor,
    people,
    elections: [a.election!, b.election!],
    candidates: [...a.candidates, ...b.candidates],
    declarations: a.supports
      .slice(0, 8)
      .map((s, i) => ({
        ...s,
        election_id: a.election!.id,
        kind: 'support',
        status: i < 3 ? 'pending' : 'published',
        source_published_at: s.declared_at,
        notes: 'Exemplo de revisão editorial.',
        version: 1,
        candidate_name: a.candidates[0].name,
        author_id: actor.id,
        source_available: true,
      })),
    roster: people.map((p) => ({
      election_id: p.house === 'camara' ? a.election!.id : b.election!.id,
      person_id: p.id,
      eligible: true,
      seat_key: p.external_id,
      source_url: 'https://example.com',
    })),
    audit: [
      {
        id: uuid(20000),
        action: 'review:publish',
        entity_id: uuid(6004),
        reason: 'Evidência conferida pela equipe editorial. Exemplo fictício.',
        created_at: '2026-10-27T18:00:00Z',
        before_data: { status: 'pending' },
        after_data: { status: 'published' },
      },
    ],
    sync: [],
    users: [actor],
    settings: { self_approval: true, correction_url: '' },
    results: [],
  };
}
