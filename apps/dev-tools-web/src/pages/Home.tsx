import { Button } from "@clanker/ui/components/button";
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
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 max-w-md flex-1 flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              Byt violett/grönt färgtema i menyn — remsan visar chart-1–5.
            </p>
            <div
              className="ring-border flex h-2.5 overflow-hidden rounded-full ring-1"
              aria-hidden
            >
              <span className="min-w-0 flex-1 bg-chart-1" />
              <span className="min-w-0 flex-1 bg-chart-2" />
              <span className="min-w-0 flex-1 bg-chart-3" />
              <span className="min-w-0 flex-1 bg-chart-4" />
              <span className="min-w-0 flex-1 bg-chart-5" />
            </div>
          </div>
          <Button type="button" className="shrink-0">
            Primärfärg (exempel)
          </Button>
        </div>
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
