import { useState } from "react";
import { BuildStamp } from "@/components/BuildStamp";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

type Method = (typeof METHODS)[number];

export function HttpPlaygroundPage() {
  const [method, setMethod] = useState<Method>("GET");
  const [url, setUrl] = useState("");
  const [headersText, setHeadersText] = useState('{\n  "Content-Type": "application/json"\n}');
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  async function send() {
    setLoading(true);
    setResult("");
    let headers: HeadersInit = {};
    const trimmed = headersText.trim();
    if (trimmed) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          setResult("Headers måste vara ett JSON-objekt med strängnycklar och strängvärden.");
          setLoading(false);
          return;
        }
        const h: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") h[k] = v;
          else {
            setResult(`Header "${k}" måste ha ett strängvärde i JSON.`);
            setLoading(false);
            return;
          }
        }
        headers = h;
      } catch {
        setResult("Ogiltig JSON i headers.");
        setLoading(false);
        return;
      }
    }

    try {
      const init: RequestInit = { method, headers };
      if (method !== "GET" && body.trim()) {
        init.body = body;
      }
      const res = await fetch(url, init);
      const text = await res.text();
      const headerLines: string[] = [];
      res.headers.forEach((v, k) => {
        headerLines.push(`${k}: ${v}`);
      });
      setResult(
        [
          `HTTP ${res.status} ${res.statusText}`,
          "",
          "--- Response headers ---",
          headerLines.join("\n") || "(inga)",
          "",
          "--- Body ---",
          text || "(tom)",
        ].join("\n"),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult(
        [
          "Fetch misslyckades (nätverk eller CORS).",
          "",
          msg,
          "",
          "Webbläsaren tillåter inte alltid anrop till andra domäner utan CORS-headers.",
          "Same-origin API:er eller tjänster med korrekt CORS fungerar. Annars: proxy eller backend.",
        ].join("\n"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tool-page layout">
      <header className="tool-page__header header">
        <h1 className="tool-page__title">API-test (HTTP)</h1>
        <p className="tagline">
          Enkel <code>fetch</code> från webbläsaren. Många API:er blockerar
          cross-origin-anrop (<strong>CORS</strong>) — då ser du fel här trots
          att t.ex. <code>curl</code> fungerar.
        </p>
      </header>
      <main className="tool-page__main main">
        <section className="card http-playground__form">
          <div className="http-playground__row">
            <label className="http-playground__label" htmlFor="http-method">
              Metod
            </label>
            <select
              id="http-method"
              className="http-playground__select"
              value={method}
              onChange={(e) => setMethod(e.target.value as Method)}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="http-playground__row">
            <label className="http-playground__label" htmlFor="http-url">
              URL
            </label>
            <input
              id="http-url"
              className="http-playground__input"
              type="url"
              placeholder="https://api.example.com/v1/ping"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="http-playground__row http-playground__row--stack">
            <label className="http-playground__label" htmlFor="http-headers">
              Headers (JSON-objekt, valfritt)
            </label>
            <textarea
              id="http-headers"
              className="http-playground__textarea"
              rows={5}
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
            />
          </div>
          <div className="http-playground__row http-playground__row--stack">
            <label className="http-playground__label" htmlFor="http-body">
              Body (för POST/PUT/PATCH/DELETE, valfritt)
            </label>
            <textarea
              id="http-body"
              className="http-playground__textarea"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="http-playground__submit"
            disabled={loading || !url.trim()}
            onClick={() => void send()}
          >
            {loading ? "Skickar…" : "Skicka"}
          </button>
        </section>
        {result ? (
          <section className="card http-playground__result card--spaced">
            <h2 className="tool-page__h2">Svar</h2>
            <pre className="http-playground__pre">{result}</pre>
          </section>
        ) : null}
        <BuildStamp />
      </main>
    </div>
  );
}
