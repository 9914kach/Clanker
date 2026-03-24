import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import backlogMd from "../../../../docs/homelab-todo.md?raw";
import { BuildStamp } from "@/components/BuildStamp";

export function HomelabTodoPage() {
  return (
    <div className="tool-page layout">
      <header className="tool-page__header header">
        <h1 className="tool-page__title">Homelab — TODO / backlog</h1>
        <p className="tagline">
          Innehållet kommer från <code>docs/homelab-todo.md</code> i repots rot.
          Redigera filen där; här syns ändringar efter omstart av dev-server
          eller ny build (Docker inkluderar filen vid image-build).
        </p>
      </header>
      <main className="tool-page__main main">
        <article className="card homelab-todo__article">
          <div className="docs-prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{backlogMd}</ReactMarkdown>
          </div>
        </article>
        <BuildStamp />
      </main>
    </div>
  );
}
