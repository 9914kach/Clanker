export function BuildStamp() {
  return (
    <footer className="build-stamp" aria-label="Build metadata">
      <span className="build-stamp__label">dev-tools-web</span>
      <span className="build-stamp__sep" aria-hidden>
        ·
      </span>
      <span>v{__APP_VERSION__}</span>
      <span className="build-stamp__sep" aria-hidden>
        ·
      </span>
      <time dateTime={__BUILD_TIME_ISO__}>build {__BUILD_TIME_ISO__}</time>
    </footer>
  );
}
