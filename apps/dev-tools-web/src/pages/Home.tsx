import { Link } from "react-router-dom";
import { BuildStamp } from "@/components/BuildStamp";

export function Home() {
  return (
    <div className="layout">
      <header className="header">
        <h1>Dev tools</h1>
        <p className="tagline">
          Lokala verktyg för att strukturera utveckling — dokumentation, checklistor
          och små utilities du lägger till över tid.
        </p>
      </header>
      <main className="main">
        <section className="card">
          <h2>Byggdokumentation</h2>
          <p className="card__lead">
            Markdown i <code>docs/</code> med versions- och byggstämpel så du ser
            exakt vad som ingick i builden.
          </p>
          <p>
            <Link to="/docs" className="text-link">
              Öppna docs viewer →
            </Link>
          </p>
        </section>
        <section className="card card--spaced">
          <h2>Fler verktyg</h2>
          <ul>
            <li>
              Lägg nya moduler under <code>src/tools/</code> med egna routes i{" "}
              <code>App.tsx</code>.
            </li>
            <li>Discord-hubben lever kvar i <code>apps/discord-hub-web/</code>.</li>
          </ul>
        </section>
        <BuildStamp />
      </main>
    </div>
  );
}
