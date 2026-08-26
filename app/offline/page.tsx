export default function OfflinePage() {
  return (
    <main className="offline-shell">
      <section className="offline-card">
        <div className="offline-mark">CF</div>
        <span className="eyebrow">MODO OFFLINE</span>
        <h1>Sem conexão com a internet</h1>
        <p>
          O CRM Family precisa de conexão para carregar dados atualizados e manter as informações das lojas seguras.
          Assim que a internet voltar, tente acessar o painel novamente.
        </p>
        <div className="offline-actions">
          <a className="primary" href="/dashboard">Tentar novamente</a>
          <a className="secondary" href="/login">Voltar ao login</a>
        </div>
      </section>
    </main>
  );
}
