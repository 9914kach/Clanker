function App() {
  return (
    <div className="layout">
      <header className="header">
        <h1>Discord hub</h1>
        <p className="tagline">
          Verktyg för discord-gänget — fler moduler kommer här.
        </p>
      </header>
      <main className="main">
        <section className="card">
          <h2>Nästa steg</h2>
          <ul>
            <li>Lägg verktyg under <code>src/tools/</code> med egna routes.</li>
            <li>
              Backend + DB: profil <code>db</code> i root{" "}
              <code>docker-compose.yml</code>, API i{" "}
              <code>apps/discord-hub-api</code> (kommer).
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}

export default App;
