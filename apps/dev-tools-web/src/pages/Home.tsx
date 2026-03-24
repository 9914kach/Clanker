import { Link } from "react-router-dom";
import { BuildStamp } from "@/components/BuildStamp";
import { toolsNav } from "@/config/toolsNav";

export function Home() {
  return (
    <div className="layout">
      <header className="header">
        <h1>Dev tools</h1>
        <p className="tagline">
          Lokala verktyg för markdown-dokumentation från hela Clanker-repot,
          checklistor, bokmärken och enkel HTTP-test. Använd menyn ovan eller
          länkarna nedan.
        </p>
      </header>
      <main className="main">
        <section className="card">
          <h2>Verktyg</h2>
          <ul>
            {toolsNav.map((item) => (
              <li key={item.id}>
                <Link to={item.path} className="text-link">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="card card--spaced">
          <h2>Utöka repot</h2>
          <p className="card__lead">
            Se <code>docs/development/checklists-and-tools.md</code> för hur du
            lägger till menyposter, checklistor och länkar. Discord-hubben
            lever i <code>apps/discord-hub-web/</code>.
          </p>
        </section>
        <BuildStamp />
      </main>
    </div>
  );
}
