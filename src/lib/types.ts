export type House = 'camara' | 'senado';
export type Role = 'editor' | 'reviewer' | 'admin';
export type Actor = { id: string; name: string; email: string; role: Role; active: boolean };
export type Person = {
  id: string;
  name: string;
  party: string;
  uf: string;
  house: House;
  photo_url: string;
  external_id: string;
  origin: string;
  manual_override: boolean;
  version: number;
};
export type Election = {
  id: string;
  house: House;
  title: string;
  seats: number;
  seats_source: string;
  composition_mode: string;
  phase: string;
  version: number;
  updated_at: string;
};
export type Candidate = {
  id: string;
  election_id: string;
  person_id: string;
  status: string;
  source_url: string;
  version: number;
  name: string;
  party: string;
  uf: string;
  photo_url: string;
  support: number;
  percentage: number;
};
export type Declaration = {
  id: string;
  election_id: string;
  person_id: string;
  candidate_id: string | null;
  kind: string;
  status: string;
  declared_at: string;
  source_url: string;
  source_name: string;
  source_published_at: string;
  excerpt: string;
  notes: string;
  version: number;
  name: string;
  party: string;
  uf: string;
  candidate_name: string;
  author_id: string;
  source_available: boolean;
};
export type Support = Pick<
  Declaration,
  | 'id'
  | 'person_id'
  | 'candidate_id'
  | 'name'
  | 'party'
  | 'uf'
  | 'declared_at'
  | 'source_url'
  | 'source_name'
  | 'excerpt'
>;
export type OfficialResult = {
  id: string;
  election_id: string;
  round: number;
  source_url: string;
  votes: { candidate_id: string; votes: number }[];
  blank: number;
  invalid: number;
  total: number;
};
export type PublicData = {
  demo: boolean;
  election: Election | null;
  candidates: Candidate[];
  supports: Support[];
  rosterCount: number;
  undeclared: number;
  neutral: number;
  contested: number;
  withdrawnSupport: number;
  updatedAt: string | null;
  syncAt: string | null;
  correctionUrl: string;
  results: OfficialResult[];
};
export type AdminData = {
  actor: Actor;
  people: Person[];
  elections: Election[];
  candidates: Candidate[];
  declarations: Declaration[];
  roster: {
    election_id: string;
    person_id: string;
    seat_key: string;
    eligible: boolean;
    source_url: string;
  }[];
  audit: {
    id: string;
    action: string;
    entity_id: string;
    reason: string;
    created_at: string;
    before_data: unknown;
    after_data: unknown;
  }[];
  sync: {
    id: string;
    house: House;
    status: string;
    count: number;
    details: string;
    started_at: string;
    finished_at: string;
  }[];
  users: Actor[];
  settings: { self_approval: boolean; correction_url: string };
  results: OfficialResult[];
};
export const houseNames: Record<House, string> = {
  camara: 'Câmara dos Deputados',
  senado: 'Senado Federal',
};
