import { type ClipboardEvent as ReactClipboardEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { getHealthCheckQueryKey, useHealthCheck } from '@workspace/api-client-react';
import {
  ArrowLeft, ArrowRight, Globe2, LockKeyhole, LoaderCircle, RotateCw, ShieldCheck,
  X, ExternalLink, MousePointer2, Keyboard, Move, AlertCircle, Radio, Copy,
} from 'lucide-react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
type RemoteState = 'disconnected' | 'connecting' | 'starting' | 'loading' | 'ready' | 'closed' | 'error';
type BrowserFrame = { image: string; url: string; title: string; status: number; viewport: { width: number; height: number } };
type BrowserMessage =
  | { type: 'status'; state: 'starting' | 'loading' | 'ready' | 'closed'; message?: string }
  | ({ type: 'frame' } & BrowserFrame)
  | { type: 'error'; message: string };
type ClientMessage =
  | { type: 'open'; url: string }
  | { type: 'navigate'; url: string }
  | { type: 'back' | 'forward' | 'reload' }
  | { type: 'pointer'; phase: 'down' | 'move' | 'up'; x: number; y: number; button: number }
  | { type: 'scroll'; x: number; y: number; deltaX: number; deltaY: number }
  | { type: 'text'; text: string }
  | { type: 'key'; key: string };

function Home() {
  const [address, setAddress] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [frame, setFrame] = useState<BrowserFrame | null>(null);
  const [remoteState, setRemoteState] = useState<RemoteState>('disconnected');
  const [socketError, setSocketError] = useState('');
  const [addressError, setAddressError] = useState('');
  const [notice, setNotice] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const lastPointerMoveRef = useRef(0);
  const addressEditingRef = useRef(false);
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000 } });
  const connected = remoteState !== 'disconnected' && remoteState !== 'closed' && remoteState !== 'error';
  const busy = remoteState === 'connecting' || remoteState === 'starting' || remoteState === 'loading';

  function send(message: ClientMessage) {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function closeSession() {
    socketRef.current?.close();
    socketRef.current = null;
    setRemoteState('disconnected');
    setFrame(null);
    setCurrentUrl('');
    setSocketError('');
    setNotice('');
  }

  function startSession(url: string) {
    socketRef.current?.close();
    setFrame(null);
    setSocketError('');
    setNotice('');
    setCurrentUrl(url);
    setAddress(url);
    addressEditingRef.current = false;
    setRemoteState('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/browser/ws`);
    socketRef.current = socket;
    socket.addEventListener('open', () => {
      if (socketRef.current !== socket) return;
      setRemoteState('starting');
      socket.send(JSON.stringify({ type: 'open', url } satisfies ClientMessage));
    });
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      if (socketRef.current !== socket) return;
      try {
        const message = JSON.parse(event.data) as BrowserMessage;
        if (message.type === 'status') {
          setRemoteState(message.state);
          if (message.message) setNotice(message.message);
          if (message.state === 'closed') {
            socketRef.current = null;
            setRemoteState('closed');
          }
        } else if (message.type === 'frame') {
          setFrame({ image: message.image, url: message.url, title: message.title, status: message.status, viewport: message.viewport });
          if (!addressEditingRef.current) setAddress(message.url);
          setCurrentUrl(message.url);
          setRemoteState('ready');
          setNotice('');
        } else {
          setSocketError(message.message || 'The remote browser encountered an error.');
          setRemoteState('error');
        }
      } catch {
        setSocketError('The browser connection returned an unreadable message.');
        setRemoteState('error');
      }
    });
    socket.addEventListener('error', () => {
      if (socketRef.current !== socket) return;
      setSocketError('Could not connect to the remote browser. Check the service and try again.');
      setRemoteState('error');
    });
    socket.addEventListener('close', () => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      setRemoteState((state) => state === 'error' ? 'error' : 'closed');
    });
  }

  useEffect(() => () => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  function parseAddress(raw: string) {
    const trimmed = raw.trim();
    const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      setAddressError('Enter a valid website address.');
      return null;
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
      setAddressError('Only public HTTP and HTTPS websites can be opened.');
      return null;
    }
    setAddressError('');
    return parsed.toString();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = parseAddress(address);
    if (!url) return;
    addressEditingRef.current = false;
    if (connected && socketRef.current?.readyState === WebSocket.OPEN) {
      navigateTo(url);
    } else {
      startSession(url);
    }
  }

  function navigateTo(url: string) {
    const parsed = parseAddress(url);
    if (!parsed) return;
    setAddress(parsed);
    setCurrentUrl(parsed);
    setFrame(null);
    setRemoteState('loading');
    send({ type: 'navigate', url: parsed });
  }

  function normalizedPoint(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  function pointer(event: ReactPointerEvent<HTMLDivElement>, phase: 'down' | 'move' | 'up') {
    if (!frame) return;
    if (phase === 'down') {
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const point = normalizedPoint(event);
    const button = phase === 'move'
      ? event.buttons === 2 ? 2 : event.buttons === 4 ? 1 : 0
      : event.button;
    send({ type: 'pointer', phase, ...point, button });
    if (phase === 'up' && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function scroll(event: WheelEvent<HTMLDivElement>) {
    if (!frame) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    send({
      type: 'scroll',
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!frame) return;
    event.preventDefault();
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      send({ type: 'text', text: event.key });
      return;
    }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
    const key = [
      event.ctrlKey ? 'Control+' : '',
      event.metaKey ? 'Meta+' : '',
      event.altKey ? 'Alt+' : '',
      event.shiftKey ? 'Shift+' : '',
      event.key,
    ].join('');
    send({ type: 'key', key });
  }

  function handlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    const text = event.clipboardData.getData('text');
    if (text && frame) {
      event.preventDefault();
      send({ type: 'text', text });
    }
  }

  const serviceLabel = health.isLoading ? 'CHECKING SERVICE' : health.isError
    ? 'SERVICE UNAVAILABLE' : `SERVICE ${String(health.data?.status ?? 'READY').toUpperCase()}`;
  const connectionLabel = remoteState === 'ready' ? 'LIVE SESSION' : remoteState === 'loading' ? 'NAVIGATING'
    : remoteState === 'starting' || remoteState === 'connecting' ? 'CONNECTING'
      : remoteState === 'error' ? 'CONNECTION ERROR' : remoteState === 'closed' ? 'SESSION ENDED' : 'NO SESSION';

  return (
    <main className="runner-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><Globe2 size={19} strokeWidth={1.8} /></div>
          <div><div className="brand-name">Chromium Runner</div><div className="brand-caption">YOUR REMOTE BROWSER</div></div>
        </div>
        <div className="topbar-status">
          <span className={`service-led ${health.isLoading ? 'is-loading' : health.isError ? 'is-error' : 'is-online'}`} />
          <span data-testid="status-service">{serviceLabel}</span>
          <span className="status-divider" />
          <span className={`session-led ${connected ? 'is-live' : remoteState === 'error' ? 'is-error' : ''}`} />
          <span data-testid="status-connection">{connectionLabel}</span>
        </div>
      </header>

      <div className="workspace">
        <section className="browser-app" aria-label="Remote browser">
          <div className="window-heading">
            <div>
              <p className="eyebrow">A private window, running elsewhere</p>
              <h1>Browse from here.</h1>
            </div>
            <div className="session-chip"><span className="pulse-dot" /> EPHEMERAL SESSION</div>
          </div>

          <div className="browser-chrome">
            <div className="toolbar">
              <div className="history-controls">
                <button type="button" className="icon-button" aria-label="Go back" title="Back" disabled={!connected} onClick={() => send({ type: 'back' })} data-testid="button-back"><ArrowLeft size={17} /></button>
                <button type="button" className="icon-button" aria-label="Go forward" title="Forward" disabled={!connected} onClick={() => send({ type: 'forward' })} data-testid="button-forward"><ArrowRight size={17} /></button>
                <button type="button" className="icon-button" aria-label="Reload page" title="Reload" disabled={!connected} onClick={() => { setRemoteState('loading'); send({ type: 'reload' }); }} data-testid="button-reload"><RotateCw size={16} className={remoteState === 'loading' ? 'turning' : ''} /></button>
              </div>
              <form className="address-form" onSubmit={submit} aria-label="Navigate to website">
                <LockKeyhole size={14} className="address-lock" aria-hidden="true" />
                <input
                  aria-label="Website address"
                  data-testid="input-target-url"
                  value={address}
                  onFocus={() => { addressEditingRef.current = true; }}
                  onBlur={() => { addressEditingRef.current = false; }}
                  onChange={(event) => { setAddress(event.target.value); setAddressError(''); }}
                  placeholder="Search or enter a website address"
                  autoComplete="url"
                  spellCheck={false}
                />
                {address && <button type="button" className="clear-address" aria-label="Clear address" data-testid="button-clear-url" onClick={() => { setAddress(''); setAddressError(''); }}><X size={14} /></button>}
                <button className="go-button" type="submit" aria-label="Navigate" data-testid="button-navigate"><ArrowRight size={16} /></button>
              </form>
              <button type="button" className="new-session-button" onClick={() => { closeSession(); window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-testid="input-target-url"]')?.focus(), 0); }} data-testid="button-new-session">
                <span className="new-session-plus">+</span><span className="new-session-label">New session</span>
              </button>
            </div>
            {(addressError || socketError) && (
              <div className="inline-alert" role="alert" data-testid={addressError ? 'text-address-error' : 'status-browser-error'}>
                <AlertCircle size={14} /><span>{addressError || socketError}</span>
                {remoteState === 'error' && currentUrl && <button type="button" onClick={() => startSession(currentUrl)} data-testid="button-retry">Try again</button>}
                {addressError && <button type="button" aria-label="Dismiss address error" onClick={() => setAddressError('')}><X size={13} /></button>}
              </div>
            )}
            <div className="viewport-frame">
              <div className="viewport-toolbar">
                <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
                <div className="tab-title" title={frame?.title || currentUrl || 'New tab'} data-testid="text-page-title">
                  <Globe2 size={13} /> <span>{frame?.title || (currentUrl ? new URL(currentUrl).hostname : 'New tab')}</span>
                </div>
                <div className="viewport-meta">
                  {frame && <span className={`http-status ${frame.status >= 400 ? 'http-bad' : ''}`} data-testid="status-http">{frame.status}</span>}
                  {frame?.url && <a href={frame.url} target="_blank" rel="noreferrer" className="open-external" title="Open this address in your local browser" aria-label="Open address in local browser" data-testid="link-open-page"><ExternalLink size={14} /></a>}
                </div>
              </div>

              <div
                className={`remote-viewport ${frame ? 'has-frame' : ''}`}
                ref={viewportRef}
                tabIndex={frame ? 0 : -1}
                role="application"
                aria-label={frame ? `Interactive remote browser page: ${frame.title || frame.url}` : 'Remote browser viewport'}
                data-testid="canvas-browser"
                onPointerDown={(event) => pointer(event, 'down')}
                onPointerMove={(event) => {
                  const now = performance.now();
                  if (now - lastPointerMoveRef.current >= 50) {
                    lastPointerMoveRef.current = now;
                    pointer(event, 'move');
                  }
                }}
                onPointerUp={(event) => pointer(event, 'up')}
                onWheel={scroll}
                onContextMenu={(event) => event.preventDefault()}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
              >
                {frame && (
                  <img
                    className="remote-frame"
                    src={frame.image}
                    alt={`Live remote browser view: ${frame.title || frame.url}`}
                    draggable={false}
                    data-testid="img-browser-frame"
                  />
                )}
                {!frame && (
                  <div className={`viewport-empty ${busy ? 'is-busy' : ''}`} aria-live="polite">
                    {busy ? (
                      <>
                        <div className="loading-orbit"><LoaderCircle size={27} /></div>
                        <p className="empty-kicker">{remoteState === 'connecting' ? 'OPENING A SECURE CHANNEL' : 'REMOTE CHROMIUM IS WORKING'}</p>
                        <h2>{remoteState === 'loading' ? 'Going to the next page.' : 'Starting your browser.'}</h2>
                        <p className="empty-copy">{notice || 'Your page will appear here as soon as the remote window is ready.'}</p>
                        <div className="loading-track"><span /></div>
                      </>
                    ) : remoteState === 'error' ? (
                      <>
                        <div className="empty-icon error-icon"><AlertCircle size={22} /></div>
                        <p className="empty-kicker">THE CONNECTION NEEDS ATTENTION</p>
                        <h2>We lost the remote window.</h2>
                        <p className="empty-copy">{socketError || 'The browser session could not be reached.'}</p>
                        {currentUrl && <button className="retry-button" type="button" onClick={() => startSession(currentUrl)} data-testid="button-retry-empty">Reconnect to page</button>}
                      </>
                    ) : (
                      <>
                        <div className="empty-icon"><Globe2 size={23} /></div>
                        <p className="empty-kicker">YOUR WINDOW IS READY WHEN YOU ARE</p>
                        <h2>Where do you want to go?</h2>
                        <p className="empty-copy">Enter a public website above. The live remote page will appear in this window.</p>
                        <div className="empty-hint"><MousePointer2 size={14} /> Click, drag, scroll and type directly in the page</div>
                      </>
                    )}
                  </div>
                )}
                {busy && frame && <div className="page-loading-bar" aria-label="Page loading"><span /></div>}
              </div>
              <div className="viewport-foot">
                <span><Radio size={12} /> {connected ? 'REMOTE VIEW CONNECTED' : 'REMOTE VIEW STANDBY'}</span>
                <span>{frame ? `${frame.viewport.width} × ${frame.viewport.height} REMOTE` : '1280 × 800 REMOTE VIEW'}</span>
              </div>
            </div>
          </div>

          <div className="interaction-row">
            <div className="interaction-copy">
              <div className="interaction-symbol"><Move size={16} /></div>
              <div><strong>It’s a real browser, not a picture.</strong><span>Interact with the page as if it were open on your own screen.</span></div>
            </div>
            <div className="control-legend">
              <span><MousePointer2 size={13} /> Click & drag</span>
              <span><Move size={13} /> Scroll</span>
              <span><Keyboard size={13} /> Type & paste</span>
            </div>
          </div>
        </section>

        <aside className="side-rail">
          <section className="rail-card safety-card">
            <div className="rail-icon"><ShieldCheck size={18} /></div>
            <p className="rail-eyebrow">A clean start, every time</p>
            <h2>Nothing follows you.</h2>
            <p>Each connection opens one isolated browser session. When it ends, its cookies and login data are discarded.</p>
            <div className="rail-rule" />
            <div className="safety-line"><span className="safety-check">01</span><span>Separate remote browser</span></div>
            <div className="safety-line"><span className="safety-check">02</span><span>No saved browsing data</span></div>
          </section>

          <section className="rail-card public-card">
            <div className="public-heading"><LockKeyhole size={15} /><span>PUBLIC WEB ONLY</span></div>
            <p>Only public websites over HTTP or HTTPS can be opened. Never enter passwords or private information.</p>
            <div className="public-address"><Globe2 size={13} /><span>https://</span><span className="address-lines">••••••••••••</span></div>
          </section>

          <section className="service-card" aria-label="Remote browser service status">
            <div className="service-card-top"><span>REMOTE SERVICE</span><span className={`service-indicator ${health.isError ? 'offline' : ''}`} /></div>
            <strong>{health.isLoading ? 'Checking connection' : health.isError ? 'Service unavailable' : 'Ready for a session'}</strong>
            <span className="service-detail" data-testid="text-service-detail">{health.isError ? 'Check back in a moment.' : 'One window per connection'}</span>
          </section>
        </aside>
      </div>

      <footer className="page-footer">
        <span><ShieldCheck size={13} /> Private to this temporary session</span>
        <span><Copy size={12} /> Remote pages are not stored here</span>
        <span className="footer-public">PUBLIC WEB ONLY <i /> HTTP + HTTPS</span>
      </footer>
    </main>
  );
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
