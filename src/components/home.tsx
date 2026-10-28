'use client';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Info,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { Brand } from './brand';
import { Avatar } from './avatar';
import type { House, PublicData } from '@/lib/types';
import { houseNames } from '@/lib/types';
export function Home({ initial }: { initial: PublicData }) {
  const [data, setData] = useState(initial),
    [house, setHouse] = useState<House>(initial.election?.house ?? 'camara'),
    [selected, setSelected] = useState(
      initial.candidates.find((c) => c.status === 'active')?.id ?? '',
    );
  const [query, setQuery] = useState(''),
    [party, setParty] = useState(''),
    [uf, setUf] = useState(''),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [method, setMethod] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const h = q.get('casa');
    if (h === 'senado' || h === 'camara') setHouse(h);
    if (q.has('candidato')) setSelected(q.get('candidato')!);
    setQuery(q.get('q') ?? '');
    setParty(q.get('partido') ?? '');
    setUf(q.get('uf') ?? '');
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams({ casa: house });
    if (selected) params.set('candidato', selected);
    if (query) params.set('q', query);
    if (party) params.set('partido', party);
    if (uf) params.set('uf', uf);
    history.replaceState(null, '', `/?${params}`);
  }, [house, selected, query, party, uf, ready]);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const controller = new AbortController();
    async function refresh() {
      setLoading(true);
      try {
        const response = await fetch(`/api/public?casa=${house}`, { signal: controller.signal });
        if (!response.ok)
          throw new Error(
            'Não foi possível atualizar os dados. A última consulta válida permanece visível.',
          );
        const next: PublicData = await response.json();
        if (cancelled) return;
        setData(next);
        setSelected((s) =>
          next.candidates.some((c) => c.id === s && c.status === 'active')
            ? s
            : (next.candidates.find((c) => c.status === 'active')?.id ?? ''),
        );
        setError('');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro de conexão.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [house, ready]);
  const switchHouse = (h: House) => {
    if (h === house) return;
    setData((d) => ({
      ...d,
      election: null,
      candidates: [],
      supports: [],
      rosterCount: 0,
      undeclared: 0,
      neutral: 0,
      contested: 0,
      withdrawnSupport: 0,
      results: [],
      updatedAt: null,
    }));
    setHouse(h);
    setSelected('');
    setParty('');
    setUf('');
    setQuery('');
    setPage(1);
  };
  const candidates = data.candidates.filter((c) => c.status === 'active'),
    chosen = candidates.find((c) => c.id === selected);
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const rows = data.supports
    .filter(
      (s) =>
        s.candidate_id === selected &&
        (!query || normalize(s.name).includes(normalize(query))) &&
        (!party || s.party === party) &&
        (!uf || s.uf === uf),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const pages = Math.max(1, Math.ceil(rows.length / 20)),
    current = Math.min(page, pages),
    visible = rows.slice((current - 1) * 20, current * 20);
  const stale = !data.demo && (!data.syncAt || Date.now() - Date.parse(data.syncAt) > 48 * 3600000);
  const date = (v: string | null) =>
    v
      ? new Date(v).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : 'Aguardando publicação';
  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <nav>
            <button className="text-button" onClick={() => setMethod(true)}>
              Como funciona
            </button>
            <a className="outline small" href="/admin">
              Área editorial <ArrowUpRight size={14} />
            </a>
          </nav>
        </div>
      </header>
      <main className="container public-main">
        <section className="hero">
          <span className="eyebrow">
            <span className="live-dot" /> OBSERVATÓRIO DAS PRESIDÊNCIAS
          </span>
          <h1>
            Quem apoia quem
            <br />
            <span>no Congresso?</span>
          </h1>
          <p>
            Acompanhe os apoios declarados. Consulte as fontes.
            <br className="desktop" /> Entenda as articulações de cada Casa.
          </p>
          <div className="house-switch" aria-label="Escolher Casa">
            {(['camara', 'senado'] as const).map((h) => (
              <button
                key={h}
                aria-pressed={house === h}
                className={house === h ? 'active' : ''}
                onClick={() => switchHouse(h)}
              >
                {houseNames[h]}
              </button>
            ))}
          </div>
          <div className="hero-meta">
            <span>{data.election?.title ?? 'Presidência • Biênio 2027–2028'}</span>
            <span className="separator">/</span>
            <span>
              <Clock3 size={13} /> {date(data.updatedAt)}
            </span>
          </div>
        </section>
        {data.demo && (
          <div className="demo-note">
            <Info size={16} />
            <span>
              <strong>Demonstração visual.</strong> Todos os nomes, partidos e apoios são fictícios.
            </span>
          </div>
        )}
        {error && (
          <div role="alert" className="notice error">
            {error}
          </div>
        )}
        {stale && (
          <div className="notice">
            Cadastro oficial aguardando sincronização. A data acima se refere à publicação
            editorial.
          </div>
        )}
        <section
          aria-busy={loading}
          className={loading && data.election?.house !== house ? 'refreshing' : ''}
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow">A DISPUTA</span>
              <h2>Candidatos à presidência</h2>
            </div>
            <span className="subtle">
              {data.election?.seats ?? '—'} cadeiras <span className="dot-separator">•</span>{' '}
              {candidates.length} candidatos
            </span>
          </div>
          {candidates.length ? (
            <div className="candidate-grid">
              {candidates.map((c, i) => (
                <button
                  key={c.id}
                  className={`candidate-card tone-${i % 3} ${c.id === selected ? 'selected' : ''}`}
                  onClick={() => {
                    setSelected(c.id);
                    setPage(1);
                  }}
                  aria-pressed={c.id === selected}
                >
                  <div className="candidate-top">
                    <Avatar name={c.name} url={c.photo_url} large />
                    <span className="selection-check">
                      {c.id === selected ? <Check size={16} /> : <ArrowUpRight size={16} />}
                    </span>
                  </div>
                  <h3>{c.name}</h3>
                  <p>
                    {c.party} <span>•</span> {c.uf}
                  </p>
                  <div className="support-number">
                    <strong>{c.support}</strong>
                    <span>
                      apoios
                      <br />
                      declarados
                    </span>
                  </div>
                  <div className="bar-label">
                    <b>
                      {c.percentage.toLocaleString('pt-BR', {
                        maximumFractionDigits: 1,
                        minimumFractionDigits: 1,
                      })}
                      %
                    </b>
                    <span>das cadeiras da Casa</span>
                  </div>
                  <div
                    className="progress"
                    role="progressbar"
                    aria-label={`Apoio declarado a ${c.name}`}
                    aria-valuenow={c.percentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: `${c.percentage}%` }} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty">
              <ShieldCheck size={30} />
              <h3>Sem candidaturas publicadas</h3>
              <p>A equipe está preparando esta cobertura. Volte em breve.</p>
            </div>
          )}
          <div className="coverage">
            <ShieldCheck size={17} />
            <span>
              <strong>{data.undeclared}</strong> parlamentares sem declaração localizada
            </span>
            <span className="subtle">
              {data.neutral > 0 ? ` · ${data.neutral} neutros` : ''}
              {data.contested > 0 ? ` · ${data.contested} em revisão` : ''}
              {data.withdrawnSupport > 0
                ? ` · ${data.withdrawnSupport} apoiam candidatos retirados`
                : ''}{' '}
              · Composição{' '}
              {data.election?.composition_mode === 'exercicio' ? 'em exercício' : 'prevista'}
            </span>
          </div>
        </section>
        {data.results.length > 0 && (
          <section className="result-panel">
            <h2>Resultado oficial</h2>
            <p>
              Apoios acima preservados no encerramento da cobertura. Votos abaixo são agregados.
            </p>
            {data.results.map((r) => (
              <div key={r.id}>
                <h3>{r.round}º turno</h3>
                {r.votes.map((v) => (
                  <p key={v.candidate_id}>
                    {data.candidates.find((c) => c.id === v.candidate_id)?.name ?? 'Candidato'}:{' '}
                    <b>{v.votes} votos</b> ({((100 * v.votes) / r.total).toFixed(1)}% dos votantes)
                  </p>
                ))}
                <p>
                  {r.blank} brancos · {r.invalid} nulos · {r.total} votantes
                </p>
                <a href={r.source_url} target="_blank" rel="noopener noreferrer">
                  Fonte oficial ↗
                </a>
              </div>
            ))}
          </section>
        )}
        <section className="supporters-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">APOIOS DOCUMENTADOS</span>
              <h2>Quem declarou apoio</h2>
              <p className="subtle">
                {chosen ? (
                  <>
                    Apoiadores de <strong>{chosen.name}</strong>
                  </>
                ) : (
                  'Selecione um candidato para consultar os apoiadores.'
                )}
              </p>
            </div>
            <span className="count-badge">{rows.length} representantes</span>
          </div>
          <div className="filter-bar">
            <label className="search">
              <Search size={18} />
              <input
                aria-label="Buscar representante"
                placeholder="Buscar representante pelo nome..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <div className="filters">
              <SlidersHorizontal size={17} />
              <select
                aria-label="Filtrar por partido"
                value={party}
                onChange={(e) => {
                  setParty(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos os partidos</option>
                {[...new Set(data.supports.map((s) => s.party))].sort().map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select
                aria-label="Filtrar por estado"
                value={uf}
                onChange={(e) => {
                  setUf(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos os estados</option>
                {[...new Set(data.supports.map((s) => s.uf))].sort().map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="table-wrap">
            <table className="support-table">
              <thead>
                <tr>
                  <th>REPRESENTANTE</th>
                  <th>PARTIDO</th>
                  <th>UF</th>
                  <th>DECLARADO EM</th>
                  <th>FONTE</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar name={s.name} />
                        <span>{s.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="party-tag">{s.party}</span>
                    </td>
                    <td>{s.uf}</td>
                    <td>
                      {new Date(s.declared_at).toLocaleDateString('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                      })}
                    </td>
                    <td>
                      {data.demo ? (
                        <span className="source-link subtle">Ilustrativa</span>
                      ) : (
                        <a
                          title={s.excerpt}
                          href={s.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="source-link"
                        >
                          Ver fonte <ArrowUpRight size={14} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <div className="empty">
                <Search size={26} />
                <h3>Nenhum representante encontrado</h3>
                <p>Tente outro nome ou remova os filtros.</p>
                <button
                  className="text-button"
                  onClick={() => {
                    setQuery('');
                    setParty('');
                    setUf('');
                  }}
                >
                  Limpar filtros
                </button>
              </div>
            )}
          </div>
          <div className="pagination">
            <span>
              Exibindo {rows.length ? (current - 1) * 20 + 1 : 0}–
              {Math.min(current * 20, rows.length)} de {rows.length} apoiadores
            </span>
            <div>
              <button
                aria-label="Página anterior"
                disabled={current <= 1}
                onClick={() => setPage(current - 1)}
              >
                <ChevronLeft size={17} />
              </button>
              <span>
                {current} / {pages}
              </span>
              <button
                aria-label="Próxima página"
                disabled={current >= pages}
                onClick={() => setPage(current + 1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </section>
        <div className="method-note">
          <Info size={18} />
          <p>
            <strong>Transparência sobre o que sabemos.</strong> Apoio declarado não confirma voto. A
            eleição é secreta. As barras representam declarações documentadas, não votos obtidos.
          </p>
          <button onClick={() => setMethod(true)} className="text-button">
            Nossa metodologia <ArrowUpRight size={15} />
          </button>
        </div>
      </main>
      <footer className="site-footer container">
        <Brand />
        <span>Informação pública. Fontes verificáveis.</span>
        {data.correctionUrl && (
          <a href={data.correctionUrl} target="_blank" rel="noopener noreferrer">
            Solicitar correção ↗
          </a>
        )}
      </footer>
      {method && (
        <div className="modal-backdrop" onClick={() => setMethod(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Metodologia"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Como acompanhamos os apoios</h2>
            <p>
              Contamos apenas declarações explícitas publicadas após revisão. Cada representante
              elegível pode ter um único apoio ativo por disputa.
            </p>
            <p>
              Percentual = apoios declarados ÷ total de cadeiras configurado e validado para a
              edição. Apoio partidário não é automaticamente atribuído aos parlamentares.
            </p>
            <p>
              Novas declarações podem substituir posições anteriores. Em caso de conflito, a
              contagem é suspensa para revisão. A votação é secreta: não identificamos o voto
              individual.
            </p>
            <p>
              Dados cadastrais: Câmara e Senado. Composição prevista: eleitos e mandatos em
              continuidade, revisados pela equipe.
            </p>
            {data.election && !data.demo && (
              <a href={data.election.seats_source} target="_blank" rel="noopener noreferrer">
                Fonte do total de cadeiras ↗
              </a>
            )}
            <button className="primary" autoFocus onClick={() => setMethod(false)}>
              Entendi
            </button>
          </section>
        </div>
      )}
    </>
  );
}
