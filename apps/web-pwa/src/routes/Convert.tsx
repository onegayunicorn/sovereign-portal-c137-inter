import React, { useCallback, useMemo, useState } from 'react';
import { PwaConverterService } from '../lib/pwa-converter';
import type { PwaConvertResult } from '../lib/pwa-converter';

export interface ConvertRouteProps {
  /** Navigates back to the portal HUD (path-based router owned by App.tsx). */
  onNavigateHome: () => void;
}

type OutputTab = 'html' | 'manifest' | 'sw';

const SAMPLE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My Sovereign App</title>
  </head>
  <body>
    <h1>Hello from a raw HTML file</h1>
    <p>Paste your own document above to convert it into an offline PWA.</p>
  </body>
</html>`;

/**
 * /convert — in-app PWA converter.
 * Paste (or fetch) any raw HTML document and get back a three-file installable
 * PWA bundle: converted index.html, manifest.webmanifest and sw.js.
 */
export const Convert: React.FC<ConvertRouteProps> = ({ onNavigateHome }) => {
  const [sourceHtml, setSourceHtml] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [appName, setAppName] = useState('Sovereign App');
  const [shortName, setShortName] = useState('SovApp');
  const [themeColor, setThemeColor] = useState('#00ff88');
  const [backgroundColor, setBackgroundColor] = useState('#010804');
  const [offlineFallback, setOfflineFallback] = useState(true);
  const [result, setResult] = useState<PwaConvertResult | null>(null);
  const [tab, setTab] = useState<OutputTab>('html');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConvert = sourceHtml.trim().length > 0;

  const handleSourceChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setSourceHtml(value);
    if (value.trim().length > 0) {
      const inferred = PwaConverterService.inferAppName(value);
      setAppName(inferred);
      setShortName(inferred.slice(0, 12) || 'SovApp');
    }
  }, []);

  const handleFetchUrl = useCallback(async () => {
    if (!PwaConverterService.isFetchableUrl(sourceUrl)) {
      setError('Enter a valid http(s) URL to fetch.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(sourceUrl, { mode: 'cors' });
      if (!response.ok) throw new Error(`Fetch failed with status ${response.status}.`);
      setSourceHtml(await response.text());
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} (the remote host may block cross-origin reads — paste the markup instead)`
          : 'Fetch failed.',
      );
    } finally {
      setBusy(false);
    }
  }, [sourceUrl]);

  const handleConvert = useCallback(() => {
    if (!canConvert) {
      setError('Paste or fetch a raw HTML document first.');
      return;
    }
    setError(null);
    try {
      const converted = PwaConverterService.convertRawHtml(sourceHtml, {
        appName: appName.trim() || 'Sovereign App',
        shortName: shortName.trim() || 'SovApp',
        themeColor,
        backgroundColor,
        offlineFallback,
      });
      setResult(converted);
      setTab('html');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed.');
    }
  }, [appName, backgroundColor, canConvert, offlineFallback, shortName, sourceHtml, themeColor]);

  const handleDownloadActive = useCallback(() => {
    if (!result) return;
    const bundle = PwaConverterService.buildBundle(result);
    const file =
      tab === 'html' ? bundle[0] : tab === 'manifest' ? bundle[1] : bundle[2];
    PwaConverterService.downloadFile(file.name, file.content, file.type);
  }, [result, tab]);

  const handleDownloadAll = useCallback(() => {
    if (!result) return;
    PwaConverterService.buildBundle(result).forEach((file) => {
      PwaConverterService.downloadFile(file.name, file.content, file.type);
    });
  }, [result]);

  const previewText = useMemo(() => {
    if (!result) return '';
    if (tab === 'html') return result.indexHtml;
    if (tab === 'manifest') return result.manifest;
    return result.serviceWorker;
  }, [result, tab]);

  return (
    <main className="portal-convert">
      <header className="portal-convert__header">
        <div>
          <h1>PWA CONVERTER</h1>
          <p>Raw HTML → installable, offline-hardened sovereign PWA.</p>
        </div>
        <button type="button" className="portal-btn" onClick={onNavigateHome}>
          &larr; Back to portal
        </button>
      </header>

      <section className="portal-convert__grid">
        <div className="portal-convert__panel">
          <label className="portal-field">
            <span>Source URL (optional)</span>
            <div className="portal-field__row">
              <input
                type="url"
                value={sourceUrl}
                placeholder="https://example.com/index.html"
                onChange={(event) => setSourceUrl(event.target.value)}
              />
              <button type="button" className="portal-btn" onClick={handleFetchUrl} disabled={busy}>
                {busy ? 'Fetching…' : 'Fetch'}
              </button>
            </div>
          </label>

          <label className="portal-field">
            <span>Raw HTML</span>
            <textarea
              value={sourceHtml}
              onChange={handleSourceChange}
              rows={12}
              spellCheck={false}
              placeholder="Paste the full HTML document here…"
            />
          </label>

          <div className="portal-convert__row">
            <button
              type="button"
              className="portal-btn"
              onClick={() => {
                setSourceHtml(SAMPLE_HTML);
                setAppName('My Sovereign App');
                setShortName('MyApp');
              }}
            >
              Load sample
            </button>
            <button type="button" className="portal-btn" onClick={() => setSourceHtml('')}>
              Clear
            </button>
          </div>

          <div className="portal-convert__options">
            <label className="portal-field">
              <span>App name</span>
              <input value={appName} onChange={(event) => setAppName(event.target.value)} />
            </label>
            <label className="portal-field">
              <span>Short name</span>
              <input value={shortName} onChange={(event) => setShortName(event.target.value)} />
            </label>
            <label className="portal-field">
              <span>Theme color</span>
              <input
                type="color"
                value={themeColor}
                onChange={(event) => setThemeColor(event.target.value)}
              />
            </label>
            <label className="portal-field">
              <span>Background color</span>
              <input
                type="color"
                value={backgroundColor}
                onChange={(event) => setBackgroundColor(event.target.value)}
              />
            </label>
            <label className="portal-field portal-field--inline">
              <input
                type="checkbox"
                checked={offlineFallback}
                onChange={(event) => setOfflineFallback(event.target.checked)}
              />
              <span>Offline navigation fallback</span>
            </label>
          </div>

          <button
            type="button"
            className="portal-btn portal-btn--primary portal-btn--wide"
            onClick={handleConvert}
            disabled={!canConvert}
          >
            CONVERT TO PWA
          </button>

          {error && <p className="portal-convert__error">{error}</p>}
          {result && result.warnings.length > 0 && (
            <ul className="portal-convert__warnings">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="portal-convert__panel">
          <div className="portal-convert__tabs">
            {(['html', 'manifest', 'sw'] as OutputTab[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`portal-tab${tab === key ? ' portal-tab--active' : ''}`}
                onClick={() => setTab(key)}
                disabled={!result}
              >
                {key === 'html' ? 'index.html' : key === 'manifest' ? 'manifest.webmanifest' : 'sw.js'}
              </button>
            ))}
          </div>

          <pre className="portal-convert__output">
            {result ? previewText : '// Output appears here after conversion.'}
          </pre>

          <div className="portal-convert__row">
            <button type="button" className="portal-btn" onClick={handleDownloadActive} disabled={!result}>
              Download file
            </button>
            <button
              type="button"
              className="portal-btn portal-btn--primary"
              onClick={handleDownloadAll}
              disabled={!result}
            >
              Download all 3 files
            </button>
          </div>

          {result && (
            <p className="portal-convert__hint">
              Drop the three files over HTTPS, add <code>/icons/icon-192.png</code> and{' '}
              <code>/icons/icon-512.png</code>, and the app installs offline. Service-worker
              registration is injected automatically.
            </p>
          )}
        </div>
      </section>
    </main>
  );
};

export default Convert;
