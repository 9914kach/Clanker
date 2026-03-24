import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Link, Navigate, NavLink, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import {
  getDocMarkdown,
  getDocSlugs,
  groupSlugsByCategory,
} from "@/lib/docModules";
import { BuildStamp } from "@/components/BuildStamp";

function slugFromParam(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

export function DocsViewer() {
  const { "*": splat } = useParams();
  const slug = slugFromParam(splat);

  const slugs = useMemo(() => getDocSlugs(), []);
  const grouped = useMemo(() => groupSlugsByCategory(slugs), [slugs]);
  const markdown = slug ? getDocMarkdown(slug) : undefined;

  if (slugs.length === 0) {
    return (
      <div className="docs-shell">
        <header className="docs-shell__header">
          <Link to="/" className="docs-back">
            ← Start
          </Link>
          <h1 className="docs-shell__title">Dokumentation</h1>
        </header>
        <p className="docs-empty">
          Inga markdown-filer under <code>apps/dev-tools-web/docs/</code> än.
          Lägg till <code>.md</code> i kategorimapparna och starta om dev-servern.
        </p>
        <BuildStamp />
      </div>
    );
  }

  if (!slug) {
    return <Navigate to={`/docs/${slugs[0]}`} replace />;
  }

  if (markdown === undefined) {
    return (
      <div className="docs-shell">
        <header className="docs-shell__header">
          <Link to="/" className="docs-back">
            ← Start
          </Link>
          <h1 className="docs-shell__title">Hittades inte</h1>
        </header>
        <p className="docs-empty">
          Ingen sida för <code>{slug}</code>.{" "}
          <Link to={`/docs/${slugs[0]}`}>Öppna första dokumentet</Link>
        </p>
        <BuildStamp />
      </div>
    );
  }

  return (
    <div className="docs-layout">
      <aside className="docs-nav" aria-label="Dokumentationsindex">
        <div className="docs-nav__top">
          <Link to="/" className="docs-back">
            ← Start
          </Link>
          <p className="docs-nav__hint">Byggdokumentation</p>
        </div>
        <nav>
          {[...grouped.entries()].map(([category, items]) => (
            <div key={category} className="docs-nav__group">
              <h2 className="docs-nav__category">{category}</h2>
              <ul className="docs-nav__list">
                {items.map((s) => {
                  const label = s.includes("/") ? s.slice(s.indexOf("/") + 1) : s;
                  return (
                    <li key={s}>
                      <NavLink
                        to={`/docs/${s}`}
                        className={({ isActive }) =>
                          isActive ? "docs-nav__link is-active" : "docs-nav__link"
                        }
                      >
                        {label}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <BuildStamp />
      </aside>
      <article className="docs-article">
        <header className="docs-article__header">
          <h1 className="docs-article__path">{slug}</h1>
        </header>
        <div className="docs-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
