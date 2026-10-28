'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { Brand } from './brand';
import { Avatar } from './avatar';
import { demoAdmin } from '@/lib/demo';
import {
  houseNames,
  type AdminData,
  type Candidate,
  type Declaration,
  type Election,
  type Person,
} from '@/lib/types';

type Field = {
  key: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  help?: string;
};
type FormSpec = {
  title: string;
  action: string;
  fields: Field[];
  initial: Record<string, unknown>;
  description?: string;
};
const option = (value: string, label: string) => ({ value, label });
const statusNames: Record<string, string> = {
  draft: 'Rascunho',
  pending: 'Em revisão',
  published: 'Publicado',
  superseded: 'Substituído',
  returned: 'Devolvido',
  rejected: 'Rejeitado',
  withdrawn: 'Retirado',
  contested: 'Contestado',
  tracking: 'Em acompanhamento',
  result: 'Resultado publicado',
  archived: 'Arquivado',
  active: 'Ativo',
  success: 'Concluído',
  failed: 'Falhou',
  running: 'Em andamento',
};
const kindNames: Record<string, string> = {
  support: 'Apoio individual',
  neutral: 'Posição neutra',
  party: 'Apoio partidário',
  self_report: 'Voto autodeclarado',
};
const tabs = [
  ['overview', 'Visão geral', LayoutDashboard],
  ['declarations', 'Declarações', FileText],
  ['review', 'Revisão editorial', CheckCircle2],
  ['candidates', 'Candidatos', Users],
  ['people', 'Parlamentares', BookOpen],
  ['elections', 'Disputas e composição', ClipboardList],
  ['sources', 'Fontes', ShieldCheck],
  ['integrations', 'Integrações', RefreshCw],
  ['audit', 'Histórico', History],
  ['settings', 'Configurações', Settings],
] as const;
const reasonField: Field = {
  key: 'reason',
  label: 'Motivo da alteração',
  type: 'textarea',
  required: true,
};
const linkField = (key: string, label: string): Field => ({
  key,
  label,
  type: 'url',
  required: true,
});
let authClient: SupabaseClient | undefined;
function auth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Configure as variáveis públicas do Supabase para entrar.');
  authClient ??= createClient(url, key);
  return authClient;
}
function localDate(v: unknown) {
  if (!v) return '';
  const d = new Date(String(v));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function Badge({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{statusNames[value] ?? value}</span>;
}
function EditorModal({
  spec,
  onClose,
  onSave,
  busy,
  demo,
}: {
  spec: FormSpec;
  onClose: () => void;
  onSave: (input: Record<string, unknown>) => Promise<void>;
  busy: boolean;
  demo: boolean;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(spec.initial),
    [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const out = { ...values };
    for (const f of spec.fields) {
      if (f.type === 'number') out[f.key] = Number(values[f.key]);
      if (f.type === 'datetime-local')
        out[f.key] = values[f.key] ? new Date(String(values[f.key])).toISOString() : null;
      if (f.type === 'json') {
        try {
          out[f.key] = JSON.parse(String(values[f.key] ?? ''));
        } catch {
          setError(`${f.label}: JSON inválido.`);
          return;
        }
      }
    }
    if (out.candidate_id === '') out.candidate_id = null;
    try {
      await onSave(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar.');
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
      >
        <div className="section-heading">
          <h2 id="edit-title">{spec.title}</h2>
          <button className="icon-button" aria-label="Fechar formulário" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {spec.description && <p className="subtle">{spec.description}</p>}
        {demo && (
          <div className="demo-note">
            Prévia do formulário. Alterações estão desativadas na demonstração.
          </div>
        )}
        <form onSubmit={submit}>
          <div className="form-grid">
            {spec.fields.map((f, i) => (
              <label
                key={f.key}
                className={['textarea', 'json'].includes(f.type ?? '') ? 'wide' : ''}
              >
                {f.label}
                {f.required && <span className="required"> *</span>}
                {f.type === 'checkbox' ? (
                  <input
                    type="checkbox"
                    checked={Boolean(values[f.key])}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })}
                  />
                ) : f.options ? (
                  <select
                    autoFocus={i === 0}
                    required={f.required}
                    value={String(values[f.key] ?? '')}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  >
                    <option value="">Selecione...</option>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : ['textarea', 'json'].includes(f.type ?? '') ? (
                  <textarea
                    required={f.required}
                    rows={f.type === 'json' ? 6 : 3}
                    value={String(values[f.key] ?? '')}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  />
                ) : (
                  <input
                    autoFocus={i === 0}
                    required={f.required}
                    type={f.type ?? 'text'}
                    value={String(values[f.key] ?? '')}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  />
                )}{' '}
                {f.help && <small>{f.help}</small>}
              </label>
            ))}
          </div>
          {error && (
            <div role="alert" className="notice error">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="outline" onClick={onClose}>
              Cancelar
            </button>
            <button className="primary" disabled={busy || demo}>
              {busy ? 'Salvando...' : 'Confirmar alteração'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function Admin({ demo }: { demo: boolean }) {
  const [data, setData] = useState<AdminData | null>(demo ? demoAdmin() : null),
    [tab, setTab] = useState('overview'),
    [filter, setFilter] = useState(''),
    [house, setHouse] = useState('camara'),
    [electionId, setElectionId] = useState(''),
    [spec, setSpec] = useState<FormSpec | null>(null),
    [detail, setDetail] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [authReady, setAuthReady] = useState(demo),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  async function request(path: string, options: RequestInit = {}) {
    const {
      data: { session },
    } = await auth().auth.getSession();
    if (!session) throw new Error('Entre na sua conta.');
    const r = await fetch(path, {
      ...options,
      headers: { Authorization: `Bearer ${session.access_token}`, ...options.headers },
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error ?? 'Falha ao consultar o servidor.');
    return body;
  }
  async function load() {
    try {
      setData(await request('/api/admin'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.');
    } finally {
      setAuthReady(true);
    }
  }
  useEffect(() => {
    if (!demo) void load();
  }, [demo]); // Session is verified again by the server on every request.
  const election =
    data?.elections.find((e) => e.id === electionId && e.house === house) ??
    data?.elections.find((e) => e.house === house);
  const admin = data?.actor.role === 'admin',
    reviewer = admin || data?.actor.role === 'reviewer';
  const people = data?.people.filter((p) => p.house === house) ?? [],
    candidates = data?.candidates.filter((c) => c.election_id === election?.id) ?? [],
    declarations = data?.declarations.filter((d) => d.election_id === election?.id) ?? [];
  const matches = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .includes(
        filter
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, ''),
      );
  const personOptions = people.map((p) => option(p.id, `${p.name} · ${p.party}/${p.uf}`));
  const eligibleOptions = personOptions.filter((p) =>
    data?.roster.some(
      (r) => r.election_id === election?.id && r.person_id === p.value && r.eligible,
    ),
  );
  const candidateOptions = candidates
    .filter((c) => c.status === 'active')
    .map((c) => option(c.id, c.name));
  const personField: Field = {
    key: 'person_id',
    label: 'Parlamentar',
    required: true,
    options: personOptions,
  };
  function editPerson(p?: Person) {
    setSpec({
      title: p ? 'Editar parlamentar' : 'Novo parlamentar',
      action: 'person',
      initial: p
        ? { ...p, reason: '' }
        : {
            house,
            origin: 'manual',
            external_id: crypto.randomUUID(),
            manual_override: true,
            photo_url: '',
          },
      description:
        'A identidade de origem é imutável. Exceções manuais não são sobrescritas pela sincronização.',
      fields: [
        { key: 'name', label: 'Nome parlamentar', required: true },
        { key: 'party', label: 'Partido', required: true },
        { key: 'uf', label: 'UF', required: true },
        { key: 'photo_url', label: 'Foto HTTPS', type: 'url' },
        { key: 'manual_override', label: 'Preservar como exceção manual', type: 'checkbox' },
        reasonField,
      ],
    });
  }
  function editElection(e?: Election) {
    setSpec({
      title: e ? 'Editar disputa' : 'Nova disputa',
      action: 'election',
      initial: e
        ? { ...e, reason: '' }
        : {
            house,
            title: 'Presidência • Biênio 2027–2028',
            seats: house === 'senado' ? 81 : '',
            composition_mode: 'prevista',
            phase: 'draft',
          },
      fields: [
        { key: 'title', label: 'Título e biênio', required: true },
        { key: 'seats', label: 'Total de cadeiras validado', type: 'number', required: true },
        linkField('seats_source', 'Fonte do total de cadeiras'),
        {
          key: 'composition_mode',
          label: 'Composição',
          options: [option('prevista', 'Prevista'), option('exercicio', 'Em exercício')],
          required: true,
        },
        {
          key: 'phase',
          label: 'Fase',
          options: ['draft', 'tracking', 'archived'].map((v) => option(v, statusNames[v])),
          required: true,
        },
        reasonField,
      ],
      description: 'Crie como rascunho, revise a composição e depois abra o acompanhamento.',
    });
  }
  function editCandidate(c?: Candidate) {
    if (!election) {
      setError('Crie uma disputa primeiro.');
      return;
    }
    setSpec({
      title: c ? 'Editar candidatura' : 'Nova candidatura',
      action: 'candidate',
      initial: c ? { ...c, reason: '' } : { election_id: election.id, status: 'active' },
      fields: [
        { ...personField, options: eligibleOptions },
        linkField('source_url', 'Fonte da candidatura'),
        {
          key: 'status',
          label: 'Situação',
          required: true,
          options: [option('active', 'Ativa'), option('withdrawn', 'Retirada')],
        },
        reasonField,
      ],
    });
  }
  function editRoster(personId?: string) {
    if (!election) {
      setError('Crie uma disputa primeiro.');
      return;
    }
    const existing = data?.roster.find(
      (r) => r.election_id === election.id && r.person_id === personId,
    );
    setSpec({
      title: 'Revisar composição',
      action: 'roster',
      initial: existing
        ? { ...existing, reason: '' }
        : { election_id: election.id, person_id: personId ?? '', eligible: true },
      fields: [
        personField,
        {
          key: 'seat_key',
          label: 'Identificador da vaga',
          required: true,
          help: 'Use o mesmo identificador para titular e suplente. Desative o ocupante anterior antes de substituir.',
        },
        linkField('source_url', 'Fonte da elegibilidade'),
        { key: 'eligible', label: 'Elegível nesta disputa', type: 'checkbox' },
        reasonField,
      ],
      description:
        'Importação cadastral não confirma elegibilidade para 2027. Revise cada mandato e sua fonte.',
    });
  }
  function editDeclaration(d?: Declaration, copy = false) {
    if (!election) {
      setError('Crie uma disputa primeiro.');
      return;
    }
    const initial = d
      ? {
          ...d,
          declared_at: localDate(d.declared_at),
          source_published_at: localDate(d.source_published_at),
          status: 'draft',
          reason: '',
        }
      : {
          election_id: election.id,
          kind: 'support',
          status: 'pending',
          declared_at: localDate(new Date()),
          source_published_at: localDate(new Date()),
          notes: '',
        };
    if (copy) {
      delete (initial as Record<string, unknown>).id;
      delete (initial as Record<string, unknown>).version;
    }
    setSpec({
      title: copy ? 'Nova revisão da declaração' : d ? 'Editar rascunho' : 'Nova declaração',
      action: 'declaration',
      initial,
      fields: [
        personField,
        {
          key: 'kind',
          label: 'Tipo de declaração',
          required: true,
          options: Object.entries(kindNames).map(([v, l]) => option(v, l)),
        },
        { key: 'candidate_id', label: 'Candidato apoiado', options: candidateOptions },
        {
          key: 'declared_at',
          label: 'Data e hora da declaração',
          type: 'datetime-local',
          required: true,
        },
        linkField('source_url', 'Link da fonte'),
        { key: 'source_name', label: 'Veículo ou autor', required: true },
        {
          key: 'source_published_at',
          label: 'Publicação da fonte',
          type: 'datetime-local',
          required: true,
        },
        {
          key: 'excerpt',
          label: 'Trecho que comprova a declaração',
          type: 'textarea',
          required: true,
        },
        { key: 'notes', label: 'Observações internas e marca temporal do vídeo', type: 'textarea' },
        {
          key: 'status',
          label: 'Salvar como',
          options: [option('draft', 'Rascunho'), option('pending', 'Enviar para revisão')],
          required: true,
        },
        reasonField,
      ],
      description:
        'Apoio partidário e voto autodeclarado não entram na contagem de apoio individual. Para posição neutra, deixe o candidato vazio. Horários usam o fuso do seu dispositivo.',
    });
  }
  function review(d: Declaration, decision: string) {
    setSpec({
      title:
        {
          publish: 'Publicar declaração',
          return: 'Devolver para edição',
          reject: 'Rejeitar declaração',
          withdraw: 'Retirar publicação',
          contest: 'Contestar publicação',
        }[decision] ?? 'Revisar',
      action: 'review',
      initial: { id: d.id, version: d.version, decision },
      fields: [reasonField],
      description: `${d.name} → ${d.candidate_name ?? 'Posição neutra'}. Fonte: ${d.source_name}. “${d.excerpt}” ${decision === 'publish' ? 'Publicar substituirá qualquer apoio individual anterior desta pessoa.' : 'A alteração será preservada no histórico.'}`,
    });
  }
  function editResult() {
    if (!election) return;
    setSpec({
      title: 'Registrar resultado oficial',
      action: 'result',
      initial: {
        election_id: election.id,
        round: 1,
        blank: 0,
        invalid: 0,
        total: '',
        votes: JSON.stringify(
          candidates.map((c) => ({ candidate_id: c.id, votes: 0 })),
          null,
          2,
        ),
      },
      fields: [
        { key: 'round', label: 'Turno', type: 'number', required: true },
        { key: 'total', label: 'Total de votantes', type: 'number', required: true },
        { key: 'blank', label: 'Votos em branco', type: 'number', required: true },
        { key: 'invalid', label: 'Votos nulos', type: 'number', required: true },
        linkField('source_url', 'Fonte oficial do resultado'),
        {
          key: 'votes',
          label: 'Votos por candidato em JSON',
          type: 'json',
          required: true,
          help: candidates.map((c) => `${c.name}: ${c.id}`).join(' · '),
        },
        reasonField,
      ],
      description:
        'Confirme os totais. A publicação encerra o acompanhamento e preserva o retrato dos apoios. Nenhum voto individual será atribuído.',
    });
  }
  async function save(input: Record<string, unknown>) {
    setBusy(true);
    try {
      await request('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: crypto.randomUUID(), action: spec!.action, input }),
      });
      setSpec(null);
      setNotice('Alteração salva. A homepage será atualizada automaticamente.');
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    setBusy(true);
    setError('');
    try {
      const r = await request('/api/admin/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ house }),
      });
      setNotice(`${r.count} cadastros sincronizados. Revise a composição separadamente.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha de sincronização.');
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function importCsv(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const r = await request('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
        body: await file.text(),
      });
      setNotice(
        `${r.count} eleitos importados. Confira identidades antes de incluí-los na composição.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na importação.');
    } finally {
      setBusy(false);
    }
  }
  function exportCsv() {
    const escape = (v: unknown) =>
      `"${String(v ?? '')
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""')}"`;
    const rows = [
      ['Nome', 'Partido', 'UF', 'Candidato', 'Tipo', 'Status', 'Fonte'],
      ...declarations.map((d) => [
        d.name,
        d.party,
        d.uf,
        d.candidate_name,
        kindNames[d.kind],
        statusNames[d.status],
        d.source_url,
      ]),
    ];
    const blob = new Blob(['\ufeff' + rows.map((r) => r.map(escape).join(';')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'declaracoes.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { error } = await auth().auth.signInWithPassword({ email, password });
      if (error) throw new Error('Não foi possível entrar. Confira suas credenciais.');
      setPassword('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao entrar.');
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="login-page">
        <Brand />
        <section className="login-card">
          <span className="eyebrow">ÁREA EDITORIAL</span>
          <h1>Bem-vindo de volta.</h1>
          <p className="subtle">Entre para revisar fontes e atualizar o observatório.</p>
          {!authReady ? (
            <p>Verificando sessão...</p>
          ) : (
            <form onSubmit={login}>
              <label>
                E-mail
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy ? 'Entrando...' : 'Entrar no dashboard'}
              </button>
            </form>
          )}
          <a href="/">← Voltar ao observatório</a>
        </section>
      </div>
    );
  const pending = declarations.filter((d) => d.status === 'pending'),
    published = declarations.filter(
      (d) =>
        d.status === 'published' &&
        d.kind === 'support' &&
        candidates.some((c) => c.id === d.candidate_id && c.status === 'active') &&
        data.roster.some(
          (r) => r.election_id === election?.id && r.person_id === d.person_id && r.eligible,
        ),
    );
  const visibleDeclarations = (tab === 'review' ? pending : declarations).filter((d) =>
    matches(`${d.name} ${d.candidate_name} ${d.source_name}`),
  );
  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <Brand />
        <span className="sidebar-caption">GESTÃO EDITORIAL</span>
        <nav>
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              className={tab === key ? 'active' : ''}
              onClick={() => {
                setTab(key);
                setFilter('');
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {key === 'review' && pending.length > 0 && <b>{pending.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={18} />
          <span>
            Informação com evidência<small>Cada apoio tem uma fonte.</small>
          </span>
        </div>
      </aside>
      <div className="admin-body">
        <header className="admin-topbar">
          <div>
            <span>Workspace editorial</span>
            <ChevronRight size={15} />
            <strong>{tabs.find((t) => t[0] === tab)?.[1]}</strong>
          </div>
          <div>
            <a href="/" target="_blank" className="text-button">
              Ver site <ArrowUpRight size={15} />
            </a>
            <span className="user-name">
              {data.actor.name}
              <small>{demo ? 'Modo demonstração' : data.actor.role}</small>
            </span>
            {!demo && (
              <button
                aria-label="Sair"
                className="icon-button"
                onClick={async () => {
                  await auth().auth.signOut();
                  setData(null);
                }}
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </header>
        <main className="admin-main">
          {demo && (
            <div className="demo-note">
              <InfoIcon />
              Prévia do dashboard • Dados fictícios • Escrita desativada
            </div>
          )}
          <div className="admin-heading">
            <div>
              <span className="eyebrow">RADAR DO CONGRESSO</span>
              <h1>{tabs.find((t) => t[0] === tab)?.[1]}</h1>
              <p className="subtle">
                {tab === 'overview'
                  ? 'Uma visão clara da cobertura e do que precisa da sua atenção.'
                  : 'Cadastre, confira e mantenha a cobertura atualizada.'}
              </p>
            </div>
            <div className="admin-selects">
              <select
                aria-label="Casa do dashboard"
                value={house}
                onChange={(e) => {
                  setHouse(e.target.value);
                  setElectionId('');
                  setFilter('');
                }}
              >
                {Object.entries(houseNames).map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                aria-label="Disputa do dashboard"
                value={election?.id ?? ''}
                onChange={(e) => setElectionId(e.target.value)}
              >
                <option value="">Selecione uma disputa</option>
                {data.elections
                  .filter((e) => e.house === house)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button onClick={() => setError('')} className="text-button">
                Fechar
              </button>
            </div>
          )}
          {notice && (
            <div className="notice success" role="status">
              {notice}
              <button onClick={() => setNotice('')} className="text-button">
                Fechar
              </button>
            </div>
          )}
          {tab === 'overview' && (
            <>
              <div className="stats-grid">
                {[
                  [
                    'Candidatos ativos',
                    candidates.filter((c) => c.status === 'active').length,
                    Users,
                  ],
                  ['Apoios publicados', published.length, ShieldCheck],
                  ['Aguardando revisão', pending.length, ClipboardList],
                  ['Parlamentares na base', people.length, BookOpen],
                ].map(([label, n, Icon]) => {
                  const I = Icon as typeof Users;
                  return (
                    <div className="stat-card" key={String(label)}>
                      <span>
                        {String(label)}
                        <I size={18} />
                      </span>
                      <strong>{String(n)}</strong>
                      <small>
                        {label === 'Aguardando revisão'
                          ? 'Prontos para conferência editorial'
                          : 'Na Casa e edição selecionadas'}
                      </small>
                    </div>
                  );
                })}
              </div>
              <div className="admin-columns">
                <section className="panel">
                  <div className="section-heading">
                    <h2>Fila de revisão</h2>
                    <button className="text-button" onClick={() => setTab('review')}>
                      Ver todas <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {pending.slice(0, 5).map((d) => (
                    <div className="review-row" key={d.id}>
                      <Avatar name={d.name} />
                      <div>
                        <strong>{d.name}</strong>
                        <p>Apoio a {d.candidate_name}</p>
                      </div>
                      <Badge value="pending" />
                      <button
                        className="icon-button"
                        aria-label={`Revisar ${d.name}`}
                        onClick={() => {
                          setTab('review');
                          setFilter(d.name);
                        }}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  ))}
                  {!pending.length && (
                    <div className="empty">
                      <CheckCircle2 size={30} />
                      <p>Nenhuma declaração aguardando revisão.</p>
                    </div>
                  )}
                </section>
                <section className="panel">
                  <h2>Ações rápidas</h2>
                  <button className="quick-action" onClick={() => editDeclaration()}>
                    <Plus />
                    <span>
                      <b>Nova declaração</b>
                      <small>Registre o apoio e sua evidência.</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  {admin && (
                    <button className="quick-action" onClick={() => setTab('integrations')}>
                      <RefreshCw />
                      <span>
                        <b>Atualizar cadastros</b>
                        <small>Sincronize as fontes oficiais.</small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  )}
                  <div className="editorial-tip">
                    <ShieldCheck size={21} />
                    <h3>A fonte vem primeiro.</h3>
                    <p>
                      Antes de publicar, confira se a declaração é individual, explícita e
                      corresponde à disputa selecionada.
                    </p>
                  </div>
                </section>
              </div>
              <section className="panel">
                <h2>Atividade recente</h2>
                {data.audit.slice(0, 5).map((a) => (
                  <div className="activity-row" key={a.id}>
                    <span className="activity-dot" />
                    <div>
                      <b>{a.action}</b>
                      <p>{a.reason}</p>
                    </div>
                    <time>
                      {new Date(a.created_at).toLocaleString('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                      })}
                    </time>
                  </div>
                ))}
              </section>
            </>
          )}
          {['declarations', 'review', 'sources'].includes(tab) && (
            <section className="panel">
              <div className="toolbar">
                <label className="search">
                  <Search size={17} />
                  <input
                    placeholder="Buscar parlamentar, candidato ou fonte..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </label>
                <button className="outline" onClick={exportCsv}>
                  <Download size={16} /> Exportar CSV
                </button>
                <button className="primary" onClick={() => editDeclaration()}>
                  <Plus size={17} /> Nova declaração
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Parlamentar</th>
                      <th>Posicionamento</th>
                      <th>Fonte</th>
                      <th>Situação</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDeclarations.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <b>{d.name}</b>
                          <small>
                            {d.party} · {d.uf}
                          </small>
                        </td>
                        <td>
                          {d.candidate_name ?? 'Posição neutra'}
                          <small>{kindNames[d.kind]}</small>
                        </td>
                        <td>
                          {demo ? (
                            <span>{d.source_name}</span>
                          ) : (
                            <a href={d.source_url} target="_blank" rel="noopener noreferrer">
                              {d.source_name} ↗
                            </a>
                          )}
                          <small>
                            {new Date(d.declared_at).toLocaleDateString('pt-BR', {
                              timeZone: 'America/Sao_Paulo',
                            })}
                          </small>
                        </td>
                        <td>
                          <Badge value={d.status} />
                        </td>
                        <td>
                          <div className="row-actions">
                            <button onClick={() => setDetail(d)}>Detalhes</button>
                            {tab === 'sources' && reviewer && (
                              <button
                                onClick={() =>
                                  setSpec({
                                    title: 'Revisar disponibilidade da fonte',
                                    action: 'source',
                                    initial: {
                                      id: d.id,
                                      version: d.version,
                                      source_available: d.source_available,
                                    },
                                    fields: [
                                      {
                                        key: 'source_available',
                                        label: 'Fonte disponível',
                                        type: 'checkbox',
                                      },
                                      reasonField,
                                    ],
                                    description:
                                      'Fonte removida não retira apoio automaticamente. Para suspender a contagem, use Contestar ou Retirar.',
                                  })
                                }
                              >
                                {d.source_available ? 'Fonte disponível' : 'Fonte indisponível'}
                              </button>
                            )}
                            {['draft', 'returned'].includes(d.status) && (
                              <button onClick={() => editDeclaration(d)}>Editar</button>
                            )}
                            {d.status === 'pending' && reviewer && (
                              <>
                                <button onClick={() => review(d, 'publish')}>Publicar</button>
                                <button onClick={() => review(d, 'return')}>Devolver</button>
                                <button onClick={() => review(d, 'reject')}>Rejeitar</button>
                              </>
                            )}
                            {d.status === 'published' && reviewer && (
                              <>
                                <button onClick={() => review(d, 'contest')}>Contestar</button>
                                <button onClick={() => review(d, 'withdraw')}>Retirar</button>
                              </>
                            )}
                            {['published', 'contested', 'withdrawn'].includes(d.status) && (
                              <button onClick={() => editDeclaration(d, true)}>Nova revisão</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visibleDeclarations.length && (
                  <div className="empty">Nenhuma declaração nesta seleção.</div>
                )}
              </div>
            </section>
          )}
          {tab === 'people' && (
            <section className="panel">
              <div className="toolbar">
                <label className="search">
                  <Search size={17} />
                  <input
                    placeholder="Buscar nome, partido ou UF..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </label>
                {admin && (
                  <button className="primary" onClick={() => editPerson()}>
                    <Plus size={17} /> Novo parlamentar
                  </button>
                )}
              </div>
              <p className="subtle">
                Cadastros não confirmam a composição de 2027. Revise a elegibilidade na disputa
                antes de publicar apoios.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Parlamentar</th>
                      <th>Partido / UF</th>
                      <th>Origem</th>
                      <th>Exceção manual</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people
                      .filter((p) => matches(`${p.name} ${p.party} ${p.uf}`))
                      .slice(0, 100)
                      .map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div className="person-cell">
                              <Avatar name={p.name} url={p.photo_url} />
                              {p.name}
                            </div>
                          </td>
                          <td>
                            {p.party} / {p.uf}
                          </td>
                          <td>
                            {p.origin}
                            <small>{p.external_id}</small>
                          </td>
                          <td>{p.manual_override ? 'Sim' : 'Não'}</td>
                          <td>
                            {admin && (
                              <div className="row-actions">
                                <button onClick={() => editPerson(p)}>Editar</button>
                                <button onClick={() => editRoster(p.id)}>Composição</button>
                                <button
                                  onClick={() =>
                                    setSpec({
                                      title: 'Conciliar identidade duplicada',
                                      action: 'merge',
                                      initial: { source_id: p.id },
                                      fields: [
                                        {
                                          key: 'target_id',
                                          label: 'Pessoa que permanecerá como identidade principal',
                                          required: true,
                                          options: personOptions.filter((o) => o.value !== p.id),
                                        },
                                        reasonField,
                                      ],
                                      description: `Confirme pelas fontes que ${p.name} e a pessoa selecionada são a mesma pessoa. Cadastros e referências serão unificados e a origem antiga será preservada como alias. Não utilize apenas semelhança de nome.`,
                                    })
                                  }
                                >
                                  Conciliar
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <small>
                Até 100 resultados por consulta. Use a busca para localizar qualquer parlamentar da
                base.
              </small>
            </section>
          )}
          {tab === 'candidates' && (
            <section className="panel">
              <div className="section-heading">
                <h2>Candidaturas da edição</h2>
                {admin && (
                  <button className="primary" onClick={() => editCandidate()}>
                    <Plus size={17} /> Novo candidato
                  </button>
                )}
              </div>
              <div className="admin-candidate-grid">
                {candidates.map((c) => (
                  <article className="admin-candidate" key={c.id}>
                    <Avatar name={c.name} url={c.photo_url} large />
                    <h3>{c.name}</h3>
                    <p>
                      {c.party} · {c.uf}
                    </p>
                    <Badge value={c.status} />
                    {admin && (
                      <button className="outline" onClick={() => editCandidate(c)}>
                        Editar candidatura
                      </button>
                    )}
                  </article>
                ))}
              </div>
              {!candidates.length && (
                <div className="empty">
                  Nenhum candidato cadastrado. Primeiro revise a composição da disputa.
                </div>
              )}
            </section>
          )}
          {tab === 'elections' && (
            <>
              <section className="panel">
                <div className="section-heading">
                  <h2>Configuração da disputa</h2>
                  {admin && (
                    <button className="primary" onClick={() => editElection()}>
                      <Plus size={17} /> Nova disputa
                    </button>
                  )}
                </div>
                {election ? (
                  <>
                    <div className="election-summary">
                      <div>
                        <h3>{election.title}</h3>
                        <p>
                          {houseNames[election.house]} · {election.seats} cadeiras · composição{' '}
                          {election.composition_mode}
                        </p>
                        <Badge value={election.phase} />
                      </div>
                      <div className="row-actions">
                        {admin && (
                          <button onClick={() => editElection(election)}>Editar disputa</button>
                        )}
                        {reviewer && <button onClick={editResult}>Registrar resultado</button>}
                      </div>
                    </div>
                  </>
                ) : (
                  <p>Crie a primeira disputa como rascunho.</p>
                )}
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>Composição revisada</h2>
                  {admin && (
                    <button className="outline" onClick={() => editRoster()}>
                      <Plus size={16} /> Incluir ou revisar pessoa
                    </button>
                  )}
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    placeholder="Buscar na composição..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </label>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Parlamentar</th>
                        <th>Vaga</th>
                        <th>Elegível</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.roster
                        .filter((r) => r.election_id === election?.id)
                        .map((r) => ({
                          ...r,
                          person: data.people.find((p) => p.id === r.person_id),
                        }))
                        .filter((r) => matches(r.person?.name ?? ''))
                        .slice(0, 100)
                        .map((r) => (
                          <tr key={r.person_id}>
                            <td>{r.person?.name}</td>
                            <td>{r.seat_key}</td>
                            <td>{r.eligible ? 'Sim' : 'Não'}</td>
                            <td>
                              {admin && (
                                <button
                                  className="text-button"
                                  onClick={() => editRoster(r.person_id)}
                                >
                                  Revisar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {tab === 'integrations' && (
            <>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Cadastros oficiais</h2>
                    <p className="subtle">
                      Nome, foto, partido e UF. Apoios e composição são revisados separadamente.
                    </p>
                  </div>
                  <button
                    className="primary"
                    disabled={!admin || busy || demo}
                    onClick={() => void sync()}
                  >
                    <RefreshCw size={17} />
                    {busy
                      ? 'Sincronizando...'
                      : `Sincronizar ${house === 'camara' ? 'Câmara' : 'Senado'}`}
                  </button>
                </div>
                <p>
                  Rotina diária configurada para 03h de Brasília no agendador. Falha parcial
                  preserva o lote anterior; correções manuais são mantidas.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Casa</th>
                        <th>Início</th>
                        <th>Status</th>
                        <th>Registros</th>
                        <th>Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sync.map((s) => (
                        <tr key={s.id}>
                          <td>{houseNames[s.house]}</td>
                          <td>
                            {new Date(s.started_at).toLocaleString('pt-BR', {
                              timeZone: 'America/Sao_Paulo',
                            })}
                          </td>
                          <td>
                            <Badge value={s.status} />
                          </td>
                          <td>{s.count}</td>
                          <td>{s.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!data.sync.length && (
                    <div className="empty">Nenhuma sincronização executada.</div>
                  )}
                </div>
              </section>
              <section className="panel">
                <h2>Importação assistida do TSE</h2>
                <p>
                  Arquivo oficial de candidaturas com situação de totalização, CSV delimitado por
                  ponto e vírgula e convertido para UTF-8. São importados apenas eleitos para
                  deputado federal ou senador. Até 2.000 linhas por arquivo.
                </p>
                <p className="subtle">
                  Colunas: SQ_CANDIDATO, NM_URNA_CANDIDATO, SG_PARTIDO, SG_UF, DS_CARGO e
                  DS_SIT_TOT_TURNO. Identidades TSE não são unificadas por nome com as do Congresso.
                </p>
                <label className="upload-label">
                  Selecionar CSV
                  <input
                    type="file"
                    accept=".csv"
                    disabled={!admin || demo || busy}
                    onChange={(e) => void importCsv(e.target.files?.[0])}
                  />
                </label>
              </section>
            </>
          )}
          {tab === 'audit' && (
            <section className="panel">
              <h2>Trilha de alterações</h2>
              <p className="subtle">
                Últimos 200 eventos. Reversões são novas revisões; o histórico nunca é apagado.
              </p>
              <label className="search">
                <Search size={17} />
                <input
                  placeholder="Buscar ação ou motivo..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
              {data.audit
                .filter((a) => matches(a.action + ' ' + a.reason))
                .map((a) => (
                  <div className="activity-row" key={a.id}>
                    <span className="activity-dot" />
                    <div>
                      <b>{a.action}</b>
                      <p>{a.reason}</p>
                      <small>
                        {new Date(a.created_at).toLocaleString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                        })}
                      </small>
                    </div>
                    <button className="text-button" onClick={() => setDetail(a)}>
                      Antes e depois <ArrowUpRight size={15} />
                    </button>
                  </div>
                ))}
            </section>
          )}
          {tab === 'settings' && (
            <>
              <section className="panel">
                <div className="section-heading">
                  <h2>Política editorial</h2>
                  {admin && (
                    <button
                      className="outline"
                      onClick={() =>
                        setSpec({
                          title: 'Configurações editoriais',
                          action: 'settings',
                          initial: { ...data.settings },
                          fields: [
                            {
                              key: 'self_approval',
                              label: 'Permitir autoaprovação do administrador',
                              type: 'checkbox',
                            },
                            {
                              key: 'correction_url',
                              label: 'Canal público de correções HTTPS',
                              type: 'url',
                            },
                            reasonField,
                          ],
                        })
                      }
                    >
                      Editar
                    </button>
                  )}
                </div>
                <p>
                  Autoaprovação do administrador:{' '}
                  <b>{data.settings.self_approval ? 'permitida e auditada' : 'desativada'}</b>.
                </p>
                <p>Canal de correções: {data.settings.correction_url || 'Não configurado'}</p>
              </section>
              {admin && (
                <section className="panel">
                  <div className="section-heading">
                    <h2>Equipe e permissões</h2>
                    <button
                      className="primary"
                      onClick={() =>
                        setSpec({
                          title: 'Autorizar membro da equipe',
                          action: 'user',
                          initial: { role: 'editor', active: true },
                          description:
                            'Crie ou convide o usuário primeiro no Supabase Auth. Cole o UUID correspondente. Nenhuma senha é armazenada neste cadastro.',
                          fields: [
                            {
                              key: 'id',
                              label: 'UUID do usuário no Supabase Auth',
                              required: true,
                            },
                            { key: 'email', label: 'E-mail', type: 'email', required: true },
                            { key: 'name', label: 'Nome', required: true },
                            {
                              key: 'role',
                              label: 'Perfil',
                              options: ['editor', 'reviewer', 'admin'].map((v) => option(v, v)),
                              required: true,
                            },
                            { key: 'active', label: 'Acesso ativo', type: 'checkbox' },
                            reasonField,
                          ],
                        })
                      }
                    >
                      <Plus size={17} /> Autorizar usuário
                    </button>
                  </div>
                  {data.users.map((u) => (
                    <div className="review-row" key={u.id}>
                      <Avatar name={u.name} />
                      <div>
                        <b>{u.name}</b>
                        <p>
                          {u.email} · {u.role} · {u.active ? 'ativo' : 'inativo'}
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() =>
                          setSpec({
                            title: 'Editar acesso',
                            action: 'user',
                            initial: { ...u },
                            fields: [
                              {
                                key: 'role',
                                label: 'Perfil',
                                options: ['editor', 'reviewer', 'admin'].map((v) => option(v, v)),
                                required: true,
                              },
                              { key: 'active', label: 'Acesso ativo', type: 'checkbox' },
                              reasonField,
                            ],
                          })
                        }
                      >
                        Editar
                      </button>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          <footer className="admin-footer">
            <Activity size={14} /> Dashboard editorial · Alterações de apoio exigem fonte e revisão.
          </footer>
        </main>
      </div>
      {spec && (
        <EditorModal
          key={`${spec.action}-${String(spec.initial.id ?? 'new')}-${spec.title}`}
          spec={spec}
          onClose={() => setSpec(null)}
          onSave={save}
          busy={busy}
          demo={demo}
        />
      )}
      {detail !== null && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes do registro"
          >
            <div className="section-heading">
              <h2>Detalhes do registro</h2>
              <button
                className="icon-button"
                onClick={() => setDetail(null)}
                aria-label="Fechar detalhes"
              >
                <X />
              </button>
            </div>
            <pre>{JSON.stringify(detail, null, 2)}</pre>
            <button className="primary" onClick={() => setDetail(null)}>
              Fechar
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function InfoIcon() {
  return <ShieldCheck size={16} />;
}
