import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Link, Navigate, NavLink, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import {
  extractFirstH1,
  getCategoryHeading,
  getDocNavTitle,
  getDocPageTitle,
} from "@/lib/docDisplay";
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
          Inga markdown-filer hittades i repot (kolla att du kör från monorepo-rot och
          att inget felaktigt filtreras bort). Starta om dev-servern efter nya{" "}
          <code>.md</code>-filer.
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

  const headingFromMd = extractFirstH1(markdown);

  return (
    <div className="docs-layout">
      <aside className="docs-nav" aria-label="Dokumentationsindex">
        <div className="docs-nav__top">
          <Link to="/" className="docs-back">
            ← Start
          </Link>
          <p className="docs-nav__hint">Repo-dokumentation</p>
        </div>
        <nav>
          {[...grouped.entries()].map(([category, items]) => (
            <div key={category} className="docs-nav__group">
              <h2 className="docs-nav__category">
                {getCategoryHeading(category)}
              </h2>
              <ul className="docs-nav__list">
                {items.map((s) => {
                  const md = getDocMarkdown(s);
                  const label = getDocNavTitle(s, md);
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
          {headingFromMd ? null : (
            <h1 className="docs-article__title">
              {getDocPageTitle(slug, markdown)}
            </h1>
          )}
          <p className="docs-article__path" title={slug}>
            <code>{slug}.md</code>
          </p>
        </header>
        <div className="docs-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
