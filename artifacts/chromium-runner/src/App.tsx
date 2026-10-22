import { type ClipboardEvent as ReactClipboardEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  AlertCircle, ArrowLeft, ArrowRight, ExternalLink, Globe2, LoaderCircle,
  LockKeyhole, Radio, RotateCw, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const PROFILE_TOKEN_KEY = 'chromium-runner-profile-v1';
type RemoteState = 'disconnected' | 'connecting' | 'starting' | 'loading' | 'ready' | 'closed' | 'error';
type ProfileState = 'empty' | 'saving' | 'saved' | 'error';
type BrowserFrame = { image: string; url: string; title: string; status: number; viewport: { width: number; height: number } };
type BrowserMessage =
  | { type: 'status'; state: 'starting' | 'loading' | 'ready' | 'closed'; message?: string }
  | { type: 'profile'; state: ProfileState; message?: string }
  | ({ type: 'frame' } & BrowserFrame)
  | { type: 'error'; message: string };
type ClientMessage =
  | { type: 'open'; url: string; profileToken: string }
  | { type: 'navigate'; url: string }
  | { type: 'clearProfile'; profileToken: string }
  | { type: 'back' | 'forward' | 'reload' }
  | { type: 'pointer'; phase: 'down' | 'move' | 'up'; x: number; y: number; button: number }
  | { type: 'scroll'; x: number; y: number; deltaX: number; deltaY: number }
  | { type: 'text'; text: string }
  | { type: 'key'; key: string };

function getOrCreateProfileToken(): string {
  const existing = window.localStorage.getItem(PROFILE_TOKEN_KEY);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const entropy = window.crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(entropy, (byte) => byte.toString(16).padStart(2, '0')).join('');
  window.localStorage.setItem(PROFILE_TOKEN_KEY, token);
  return token;
}

function Home() {
  const [address, setAddress] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [frame, setFrame] = useState<BrowserFrame | null>(null);
  const [remoteState, setRemoteState] = useState<RemoteState>('disconnected');
  const [socketError, setSocketError] = useState('');
  const [addressError, setAddressError] = useState('');
  const [notice, setNotice] = useState('');
  const [profileState, setProfileState] = useState<ProfileState>('empty');
  const socketRef = useRef<WebSocket | null>(null);
  const profileTokenRef = useRef<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const lastPointerMoveRef = useRef(0);
  const addressEditingRef = useRef(false);
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

  function clearSavedProfile() {
    const socket = socketRef.current;
    const profileToken = profileTokenRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !profileToken) return;
    if (!window.confirm('Clear saved cookies and site data for this browser?')) return;
    setSocketError('');
    setProfileState('saving');
    send({ type: 'clearProfile', profileToken });
  }

  function startSession(url: string) {
    let profileToken: string;
    try {
      profileToken = profileTokenRef.current ?? getOrCreateProfileToken();
      profileTokenRef.current = profileToken;
    } catch {
      setSocketError('This browser cannot keep a saved profile. Enable site storage and try again.');
      setRemoteState('error');
      setProfileState('error');
      return;
    }
    socketRef.current?.close();
    setFrame(null);
    setSocketError('');
    setNotice('');
    setCurrentUrl(url);
    setAddress(url);
    addressEditingRef.current = false;
    setProfileState('saving');
    setRemoteState('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/browser/ws`);
    socketRef.current = socket;
    socket.addEventListener('open', () => {
      if (socketRef.current !== socket) return;
      setRemoteState('starting');
      socket.send(JSON.stringify({ type: 'open', url, profileToken } satisfies ClientMessage));
    });
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      if (socketRef.current !== socket) return;
      try {
        const message = JSON.parse(event.data) as BrowserMessage;
        if (message.type === 'profile') {
          setProfileState(message.state);
          if (message.state === 'error' && message.message) setSocketError(message.message);
        } else if (message.type === 'status') {
          setRemoteState(message.state);
          if (message.message) setNotice(message.message);
          if (message.state === 'closed') {
            socketRef.current = null;
            setFrame(null);
            setAddress('');
            setCurrentUrl('');
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

  useEffect(() => {
    try {
      profileTokenRef.current = getOrCreateProfileToken();
    } catch {
      setProfileState('error');
    }
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
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

  const connectionLabel = remoteState === 'ready' ? 'LIVE SESSION' : remoteState === 'loading' ? 'NAVIGATING'
    : remoteState === 'starting' || remoteState === 'connecting' ? 'CONNECTING'
      : remoteState === 'error' ? 'CONNECTION ERROR' : remoteState === 'closed' ? 'SESSION ENDED' : 'NO SESSION';
  const profileLabel = profileState === 'saved' ? 'SAVED TO THIS DEVICE'
    : profileState === 'saving' ? 'SAVING PROFILE'
      : profileState === 'error' ? 'SAVE ERROR' : 'LOCAL PROFILE';

  return (
    <main className="runner-shell">
      <section className="browser-app" aria-label="Remote browser">
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
            <button
              type="button"
              className="icon-button clear-profile-button"
              aria-label="Clear saved cookies and site data"
              title="Clear saved cookies and site data"
              disabled={!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN}
              onClick={clearSavedProfile}
              data-testid="button-clear-profile"
            >
              <Trash2 size={15} />
            </button>
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
                <span className={`profile-status profile-${profileState}`} title="Cookies and site data are encrypted and saved for this browser on this device." data-testid="status-profile">
                  {profileState === 'saved' ? <ShieldCheck size={13} /> : profileState === 'saving' ? <LoaderCircle size={13} className="turning" /> : profileState === 'error' ? <AlertCircle size={13} /> : <LockKeyhole size={13} />}
                  <span>{profileLabel}</span>
                </span>
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
                if (now - lastPointerMoveRef.current >= 16) {
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
                      <div className="loading-orbit"><LoaderCircle size={24} /></div>
                      <h2>{remoteState === 'loading' ? 'Loading page' : 'Starting browser'}</h2>
                      <p className="empty-copy">{notice || 'Your page will appear here.'}</p>
                    </>
                  ) : remoteState === 'error' ? (
                    <>
                      <div className="empty-icon error-icon"><AlertCircle size={20} /></div>
                      <h2>Connection error</h2>
                      <p className="empty-copy">{socketError || 'The remote browser could not be reached.'}</p>
                      {currentUrl && <button className="retry-button" type="button" onClick={() => startSession(currentUrl)} data-testid="button-retry-empty">Reconnect</button>}
                    </>
                  ) : (
                    <>
                      <div className="empty-icon"><Globe2 size={21} /></div>
                      <h2>New tab</h2>
                      <p className="empty-copy">{notice || 'Enter a website address above.'}</p>
                    </>
                  )}
                </div>
              )}
              {busy && frame && <div className="page-loading-bar" aria-label="Page loading"><span /></div>}
            </div>
            <div className="viewport-foot">
              <span><Radio size={12} /> {connectionLabel}</span>
              <span>{frame ? `${frame.viewport.width} × ${frame.viewport.height}` : '1280 × 800'}</span>
            </div>
          </div>
        </div>
      </section>
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
