import { type ClipboardEvent as ReactClipboardEvent, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useRemoteScroll } from '@/hooks/use-remote-scroll';
import { remotePoint } from '@/lib/remote-point';
import { SiteChat } from '@/components/site-chat';
import { useActivityConsent } from '@/lib/activity-consent';
import { ActivitySettings } from '@/components/activity-settings';
import { TabDisguise } from '@/components/tab-disguise';
import { PetSidebar } from '@/components/pet-sidebar';
import { BrowserTools } from '@/components/browser-tools';
import { BookmarkPanel } from '@/components/bookmark-panel';
import { createBookmark, loadBookmarks, saveBookmarks, type Bookmark } from '@/components/bookmark-storage';
import { useThemePreference } from '@/lib/theme-preference';
import {
  AlertCircle, ArrowLeft, ArrowRight, Bookmark as BookmarkIcon, BookmarkCheck, ExternalLink, Globe2, LoaderCircle,
  LockKeyhole, Moon, Radio, RotateCw, ShieldCheck, Sun, Trash2, X, Maximize2, Minimize2, UserCog,
} from 'lucide-react';

const PROFILE_TOKEN_KEY = 'chromium-runner-profile-v1';
const ADDRESS_COLOR_KEY = 'chromium-runner-address-color-v1';
const DEFAULT_ADDRESS_COLOR = '#f0f1eb';
type RemoteState = 'disconnected' | 'connecting' | 'starting' | 'loading' | 'ready' | 'closed' | 'error';
type ProfileState = 'empty' | 'saving' | 'saved' | 'error';
type BrowserFrame = { image: string; url: string; title: string; status: number; viewport: { width: number; height: number }; scroll?: { ratio: number; canScroll: boolean }; fitToWidth?: boolean };

function loadAddressColor(): string {
  try {
    const value = window.localStorage.getItem(ADDRESS_COLOR_KEY);
    return value && /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_ADDRESS_COLOR;
  } catch {
    return DEFAULT_ADDRESS_COLOR;
  }
}

function addressInk(color: string): string {
  const channels = color.slice(1).match(/.{2}/g)?.map((channel) => parseInt(channel, 16) / 255) ?? [0.94, 0.94, 0.92];
  const [r, g, b] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? '#293b3d' : '#fffdf5';
}

type BrowserMessage =
  | { type: 'status'; state: 'starting' | 'loading' | 'ready' | 'closed'; message?: string }
  | { type: 'profile'; state: ProfileState; message?: string }
  | ({ type: 'frame' } & BrowserFrame)
  | { type: 'error'; message: string };
type ClientMessage =
  | { type: 'open'; url: string; profileToken: string }
  | { type: 'tracking'; token: string | null }
  | { type: 'navigate'; url: string }
  | { type: 'clearProfile'; profileToken: string }
  | { type: 'back' | 'forward' | 'reload' }
  | { type: 'fitWidth'; enabled: boolean }
  | { type: 'scrollTo'; ratio: number }
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

export default function Home() {
  const { consent, refetch: refreshAcceptance } = useActivityConsent();
  const { darkMode, toggleDarkMode } = useThemePreference();
  const trackingTokenRef = useRef<string | null>(null);
  trackingTokenRef.current = consent?.enabled ? consent.token : null;
  const [address, setAddress] = useState('');
  const [addressColor, setAddressColor] = useState(loadAddressColor);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(loadBookmarks);
  const [currentUrl, setCurrentUrl] = useState('');
  const [frame, setFrame] = useState<BrowserFrame | null>(null);
  const [remoteState, setRemoteState] = useState<RemoteState>('disconnected');
  const [socketError, setSocketError] = useState('');
  const [addressError, setAddressError] = useState('');
  const [notice, setNotice] = useState('');
  const [profileState, setProfileState] = useState<ProfileState>('empty');
  const [maximized, setMaximized] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const scrollDraggingRef = useRef(false);
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

  function changeAddressColor(color: string) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    setAddressColor(color);
    try { window.localStorage.setItem(ADDRESS_COLOR_KEY, color); } catch { /* Keep the selection for this session if storage is unavailable. */ }
  }

  function toggleCurrentBookmark() {
    if (!frame?.url || remoteState !== 'ready') return;
    const existing = bookmarks.find((bookmark) => bookmark.url === frame.url || bookmark.url === currentUrl);
    let next: Bookmark[];
    if (existing) {
      next = bookmarks.filter((bookmark) => bookmark.id !== existing.id);
    } else {
      if (bookmarks.length >= 100) {
        setNotice('You have 100 bookmarks. Remove one before saving another.');
        return;
      }
      let fallbackTitle = frame.title;
      try { fallbackTitle ||= new URL(frame.url).hostname; } catch { fallbackTitle ||= 'Saved page'; }
      const bookmark = createBookmark(frame.url, fallbackTitle);
      if (!bookmark) {
        setNotice('This page could not be saved as a bookmark.');
        return;
      }
      next = [bookmark, ...bookmarks];
    }
    setBookmarks(next);
    if (!saveBookmarks(next)) setNotice('Bookmark storage is unavailable. It will be lost when this page closes.');
  }

  function openBookmark(url: string) {
    const parsed = parseAddress(url);
    if (!parsed) return;
    if (connected && socketRef.current?.readyState === WebSocket.OPEN) navigateTo(parsed);
    else startSession(parsed);
  }

  function removeBookmark(id: string) {
    const next = bookmarks.filter((bookmark) => bookmark.id !== id);
    setBookmarks(next);
    if (!saveBookmarks(next)) setNotice('Bookmark storage is unavailable. This removal only applies for this session.');
  }

  useRemoteScroll(viewportRef, frame?.viewport ?? null, send);

  useEffect(() => {
    if (!maximized) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setMaximized(false);
      viewportRef.current?.focus();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [maximized]);

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
      socket.send(JSON.stringify({ type: 'tracking', token: trackingTokenRef.current } satisfies ClientMessage));
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
          setFrame({ image: message.image, url: message.url, title: message.title, status: message.status, viewport: message.viewport, scroll: message.scroll, fitToWidth: message.fitToWidth });
          if (!scrollDraggingRef.current) setScrollPosition(message.scroll?.ratio ?? 0);
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
    socket.addEventListener('close', (event) => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      if (event.code === 1008) refreshAcceptance();
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

  const trackingToken = consent?.enabled ? consent.token : null;
  useEffect(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'tracking', token: trackingToken } satisfies ClientMessage));
  }, [trackingToken]);

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
    return remotePoint(event.currentTarget, event.clientX, event.clientY, frame!.viewport);
  }

  function pointer(event: ReactPointerEvent<HTMLDivElement>, phase: 'down' | 'move' | 'up') {
    if (!frame || event.pointerType === 'touch') return;
    const point = normalizedPoint(event);
    if (!point.inside && !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (phase === 'down') {
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const button = phase === 'move'
      ? event.buttons === 2 ? 2 : event.buttons === 4 ? 1 : 0
      : event.button;
    send({ type: 'pointer', phase, ...point, button });
    if (phase === 'up' && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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
        <div className={`browser-chrome ${maximized ? 'is-maximized' : ''}`}>
          <div className="browser-brandline" aria-label="Chromium remote browser">
            <span className="browser-brand-mark" aria-hidden="true"><span /></span>
            <span className="browser-brand-name">CHROMIUM <b>REMOTE</b></span>
            <span className={`browser-session-state state-${remoteState}`} data-testid="status-session">
              <i aria-hidden="true" />{connectionLabel}
            </span>
          </div>
          <div className="toolbar">
              <div className="toolbar-navigation" role="group" aria-label="Browser navigation">
                <button type="button" className="icon-button" aria-label="Go back" title="Go back" disabled={!connected} onClick={() => send({ type: 'back' })} data-testid="button-back"><ArrowLeft size={17} /></button>
                <button type="button" className="icon-button" aria-label="Go forward" title="Go forward" disabled={!connected} onClick={() => send({ type: 'forward' })} data-testid="button-forward"><ArrowRight size={17} /></button>
                <button type="button" className="icon-button" aria-label="Reload page" title="Reload page" disabled={!connected} onClick={() => { setRemoteState('loading'); send({ type: 'reload' }); }} data-testid="button-reload"><RotateCw size={16} className={remoteState === 'loading' ? 'turning' : ''} /></button>
                {frame?.url && <a href={frame.url} target="_blank" rel="noreferrer" className="icon-button" aria-label="Open address in local browser" title="Open in local browser" data-testid="link-open-page"><ExternalLink size={16} /></a>}
              </div>
            <form
              className="address-form"
              onSubmit={submit}
              aria-label="Navigate to website"
              style={{ '--address-bar-color': addressColor, '--address-bar-ink': addressInk(addressColor) } as CSSProperties}
            >
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
              <button
                type="button"
                className={`bookmark-current${bookmarks.some((bookmark) => bookmark.url === frame?.url || bookmark.url === currentUrl) ? ' is-saved' : ''}`}
                aria-label={bookmarks.some((bookmark) => bookmark.url === frame?.url || bookmark.url === currentUrl) ? 'Remove current page bookmark' : 'Bookmark current page'}
                aria-pressed={bookmarks.some((bookmark) => bookmark.url === frame?.url || bookmark.url === currentUrl)}
                title={bookmarks.some((bookmark) => bookmark.url === frame?.url || bookmark.url === currentUrl) ? 'Remove bookmark' : 'Bookmark this page'}
                disabled={!frame?.url || remoteState !== 'ready'}
                onClick={toggleCurrentBookmark}
                data-testid="button-bookmark-current"
              >
                {bookmarks.some((bookmark) => bookmark.url === frame?.url || bookmark.url === currentUrl)
                  ? <BookmarkCheck size={15} />
                  : <BookmarkIcon size={15} />}
              </button>
              <button className="go-button" type="submit" aria-label="Navigate" data-testid="button-navigate"><ArrowRight size={16} /></button>
            </form>
            <SiteChat />
          </div>
          <BrowserTools>
            <section className="tools-section" aria-label="Workspace">
              <h3>Workspace</h3>
              <TabDisguise />
              <button type="button" className="icon-button" aria-label={maximized ? 'Restore display' : 'Maximize display'} onClick={() => setMaximized(value => !value)} data-testid="button-maximize">{maximized ? <Minimize2 size={17} /> : <Maximize2 size={17} />}<span>{maximized ? 'Restore display' : 'Maximize display'}</span></button>
            </section>
            <section className="tools-section" aria-label="Bookmarks">
              <h3>Bookmarks</h3>
              <BookmarkPanel bookmarks={bookmarks} onOpen={openBookmark} onRemove={removeBookmark} />
            </section>
            <section className="tools-section" aria-label="Appearance">
              <h3>Appearance</h3>
              <button
                type="button"
                role="switch"
                aria-checked={darkMode}
                aria-label="Dark mode"
                className="tools-theme-control"
                onClick={toggleDarkMode}
                data-testid="button-dark-mode"
              >
                <span className="tools-theme-icon" aria-hidden="true">{darkMode ? <Moon size={16} /> : <Sun size={16} />}</span>
                <span className="tools-theme-label"><strong>Dark mode</strong><small>{darkMode ? 'On' : 'Off'}</small></span>
                <span className={`tools-theme-switch${darkMode ? ' is-on' : ''}`} aria-hidden="true"><i /></span>
              </button>
              <label className="tools-color-control">
                <span>Search bar color</span>
                <input type="color" aria-label="Search bar color" value={addressColor} onChange={(event) => changeAddressColor(event.target.value)} data-testid="input-address-color" />
              </label>
              <button type="button" className="tools-color-reset" onClick={() => changeAddressColor(DEFAULT_ADDRESS_COLOR)} data-testid="button-address-color-reset">Reset color</button>
            </section>
            <section className="tools-section" aria-label="Session and settings">
              <h3>Session &amp; settings</h3>
              <ActivitySettings />
              <Link href="/owner" className="icon-button owner-link" aria-label="Owner dashboard" data-testid="link-owner"><UserCog size={16} /><span>Owner dashboard</span></Link>
            <button
              type="button"
              className="icon-button clear-profile-button"
              aria-label="Clear saved cookies and site data"
              title="Clear saved cookies and site data"
              disabled={!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN}
              onClick={clearSavedProfile}
              data-testid="button-clear-profile"
            >
              <Trash2 size={15} /><span>Clear saved site data</span>
            </button>
            <button type="button" className="new-session-button" onClick={() => { closeSession(); window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-testid="input-target-url"]')?.focus(), 0); }} data-testid="button-new-session">
              <span className="new-session-plus">+</span><span className="new-session-label">New session</span>
            </button>
            </section>
          </BrowserTools>
          <PetSidebar />
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
              onContextMenu={(event) => event.preventDefault()}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
            >
              {frame?.scroll?.canScroll && (
                <input type="range" min="0" max="1000" step="1"
                  className="page-scrollbar" data-local-control data-testid="page-scrollbar"
                  aria-label="Page vertical scroll" aria-orientation="vertical"
                  aria-valuetext={`${Math.round(scrollPosition * 100)}% down the page`}
                  value={Math.round(scrollPosition * 1000)}
                  onPointerDown={(event) => { event.stopPropagation(); scrollDraggingRef.current = true; }}
                  onPointerMove={(event) => event.stopPropagation()}
                  onPointerUp={(event) => { event.stopPropagation(); scrollDraggingRef.current = false; }}
                  onPointerCancel={() => { scrollDraggingRef.current = false; }}
                  onKeyDown={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    const ratio = Number(event.target.value) / 1000;
                    setScrollPosition(ratio);
                    send({ type: 'scrollTo', ratio });
                  }}
                />
              )}
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
