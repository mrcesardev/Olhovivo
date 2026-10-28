CREATE SCHEMA IF NOT EXISTS radar;
SET search_path TO radar, public;

CREATE TABLE app_users (
 id uuid PRIMARY KEY, email text NOT NULL, name text NOT NULL,
 role text NOT NULL CHECK(role IN ('editor','reviewer','admin')),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE settings (id integer PRIMARY KEY CHECK(id=1), self_approval boolean NOT NULL DEFAULT true, correction_url text NOT NULL DEFAULT '');
INSERT INTO settings(id) VALUES(1);
CREATE TABLE people (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), house text NOT NULL CHECK(house IN ('camara','senado')),
 external_id text NOT NULL, origin text NOT NULL CHECK(origin IN ('camara','senado','tse','manual')),
 name text NOT NULL, party text NOT NULL, uf text NOT NULL CHECK(length(uf)=2), photo_url text NOT NULL DEFAULT '',
 manual_override boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1, UNIQUE(origin,external_id)
);
CREATE TABLE elections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), house text NOT NULL CHECK(house IN ('camara','senado')),
 title text NOT NULL, seats integer NOT NULL CHECK(seats BETWEEN 1 AND 1000), seats_source text NOT NULL,
 composition_mode text NOT NULL DEFAULT 'prevista' CHECK(composition_mode IN ('prevista','exercicio')),
 phase text NOT NULL DEFAULT 'draft' CHECK(phase IN ('draft','tracking','result','archived')),
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), closed_snapshot jsonb
);
CREATE TABLE person_aliases (origin text NOT NULL, external_id text NOT NULL, person_id uuid NOT NULL REFERENCES people(id), PRIMARY KEY(origin,external_id));
CREATE UNIQUE INDEX one_open_election ON elections(house) WHERE phase IN ('tracking','result');
CREATE TABLE roster (
 election_id uuid NOT NULL REFERENCES elections(id), person_id uuid NOT NULL REFERENCES people(id),
 seat_key text NOT NULL, eligible boolean NOT NULL DEFAULT true, source_url text NOT NULL,
 PRIMARY KEY(election_id,person_id)
);
CREATE UNIQUE INDEX one_person_per_seat ON roster(election_id,seat_key) WHERE eligible;
CREATE TABLE candidates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), election_id uuid NOT NULL REFERENCES elections(id),
 person_id uuid NOT NULL REFERENCES people(id), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','withdrawn')),
 source_url text NOT NULL, version integer NOT NULL DEFAULT 1, UNIQUE(election_id,person_id)
);
CREATE TABLE declarations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), election_id uuid NOT NULL REFERENCES elections(id),
 person_id uuid NOT NULL REFERENCES people(id), candidate_id uuid REFERENCES candidates(id),
 kind text NOT NULL CHECK(kind IN ('support','neutral','party','self_report')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','published','superseded','returned','rejected','withdrawn','contested')),
 declared_at timestamptz NOT NULL, source_url text NOT NULL, source_name text NOT NULL, source_published_at timestamptz NOT NULL,
 excerpt text NOT NULL, consulted_at timestamptz NOT NULL DEFAULT now(), party_at_declaration text NOT NULL,
 source_available boolean NOT NULL DEFAULT true, notes text NOT NULL DEFAULT '',
 author_id uuid NOT NULL REFERENCES app_users(id), reviewer_id uuid REFERENCES app_users(id),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((kind IN ('support','party','self_report') AND candidate_id IS NOT NULL) OR (kind='neutral' AND candidate_id IS NULL))
);
CREATE UNIQUE INDEX one_current_position ON declarations(election_id,person_id) WHERE status='published' AND kind IN ('support','neutral');
CREATE INDEX declaration_lookup ON declarations(election_id,candidate_id,status);
CREATE INDEX people_lookup ON people(house,name);
CREATE TABLE results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), election_id uuid NOT NULL REFERENCES elections(id), round integer NOT NULL CHECK(round BETWEEN 1 AND 5),
 source_url text NOT NULL, votes jsonb NOT NULL, blank integer NOT NULL CHECK(blank>=0), invalid integer NOT NULL CHECK(invalid>=0),
 total integer NOT NULL CHECK(total>0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(election_id,round)
);
CREATE TABLE audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES app_users(id), action text NOT NULL,
 entity_id text NOT NULL, before_data jsonb, after_data jsonb, reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sync_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), house text NOT NULL, status text NOT NULL CHECK(status IN ('running','success','failed')),
 count integer NOT NULL DEFAULT 0, details text NOT NULL DEFAULT '', started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE UNIQUE INDEX one_running_sync ON sync_runs(house) WHERE status='running';
CREATE TABLE requests (key uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES app_users(id), payload_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE rate_limits (actor_id uuid NOT NULL REFERENCES app_users(id), bucket bigint NOT NULL, count integer NOT NULL DEFAULT 1, PRIMARY KEY(actor_id,bucket));

-- API clients never write tables directly. The server checks Supabase Auth and app_users.
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA radar FROM PUBLIC;
REVOKE ALL ON SCHEMA radar FROM PUBLIC;
