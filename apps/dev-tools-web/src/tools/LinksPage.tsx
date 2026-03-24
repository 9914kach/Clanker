import externalLinks from "@/data/externalLinks.json";
import type { ExternalLinksFile } from "@/tools/linksTypes";
import { BuildStamp } from "@/components/BuildStamp";

const data = externalLinks as ExternalLinksFile;

export function LinksPage() {
  return (
    <div className="tool-page layout">
      <header className="tool-page__header header">
        <h1 className="tool-page__title">Länkar</h1>
        <p className="tagline">
          Redigera <code>src/data/externalLinks.json</code> — inga hemligheter i
          filen.
        </p>
      </header>
      <main className="tool-page__main main">
        {data.groups.map((group) => (
          <section key={group.title} className="tool-page__section card">
            <h2 className="tool-page__h2">{group.title}</h2>
            <ul className="links-page__list">
              {group.links.map((link) => (
                <li key={link.href + link.label} className="links-page__item">
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-link"
                  >
                    {link.label}
                  </a>
                  {link.description ? (
                    <p className="tool-page__muted links-page__desc">
                      {link.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <BuildStamp />
      </main>
    </div>
  );
}
