'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="container empty">
      <h1>Não foi possível carregar a página</h1>
      <p>Seus registros permanecem preservados. Tente novamente.</p>
      <button className="primary" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
