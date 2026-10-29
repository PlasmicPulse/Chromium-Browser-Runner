import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getListChatMessagesQueryKey, listChatMessages, sendChatMessage, setChatName, type ChatMessage, type ChatMessageInput } from '@workspace/api-client-react';
import { ArrowRight, MessageCircle, Pencil, Send } from 'lucide-react';
import { useActivityConsent } from '@/lib/activity-consent';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { rememberSentChat, savedChatName, saveChatName, sentChatIds, validChatName } from '@/lib/chat-identity';

const CHAT_READ_CURSOR_KEY = 'chromium-runner-chat-read-cursor-v1';

function loadChatReadCursor(): number | null {
  try {
    const value = localStorage.getItem(CHAT_READ_CURSOR_KEY);
    if (!value) return null;
    const cursor = Number(value);
    return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : null;
  } catch {
    return null;
  }
}

function saveChatReadCursor(cursor: number): void {
  try { localStorage.setItem(CHAT_READ_CURSOR_KEY, String(cursor)); } catch { /* Unread state still works for this page view. */ }
}

export function SiteChat() {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(savedChatName);
  const ownIdsRef = useRef(sentChatIds());
  const [unread, setUnread] = useState(false);
  const [readingHistory, setReadingHistory] = useState(false);
  const lastReadCursorRef = useRef(loadChatReadCursor());
  const readCursorInitializedRef = useRef(lastReadCursorRef.current !== null);
  const { consent } = useActivityConsent();
  const queryClient = useQueryClient();
  const key = getListChatMessagesQueryKey();
  const messageFeed = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => listChatMessages({ signal }),
    enabled: !!consent?.enabled && !open,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  useEffect(() => {
    const messages = messageFeed.data;
    if (!messages) return;
    const latestId = messages.reduce((latest, item) => Math.max(latest, item.id), 0);

    if (!readCursorInitializedRef.current) {
      lastReadCursorRef.current = latestId;
      readCursorInitializedRef.current = true;
      saveChatReadCursor(latestId);
      return;
    }

    if (readingHistory) {
      if (latestId > (lastReadCursorRef.current ?? 0)) {
        lastReadCursorRef.current = latestId;
        saveChatReadCursor(latestId);
      }
      setUnread(false);
      return;
    }

    setUnread(latestId > (lastReadCursorRef.current ?? 0));
  }, [messageFeed.data, readingHistory]);

  function chooseName(name: string) {
    saveChatName(name);
    setUsername(name);
  }

  const handleHistoryVisibilityChange = useCallback((visible: boolean) => {
    setReadingHistory(open && visible);
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setReadingHistory(nextOpen && !!username);
    if (!nextOpen) setUnread(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button type="button" className="icon-button chat-trigger"
          aria-label={unread ? 'Open community chat, unread messages' : 'Open community chat'}
          title={unread ? 'Community chat — new messages' : 'Community chat'}
          data-testid="button-chat" data-unread={unread}>
          <MessageCircle size={17} />
          {unread && <span className="chat-unread-dot" aria-hidden="true" data-testid="chat-unread-dot" />}
          <span className="tools-label">Community chat</span>
        </button>
      </DialogTrigger>
      <DialogContent className="site-chat" onKeyDown={event => event.stopPropagation()}>
        <header className="chat-room-header">
          <div className="chat-room-icon" aria-hidden="true"><MessageCircle size={21} /></div>
          <div>
            <DialogTitle>Community chat</DialogTitle>
            <DialogDescription>Everyone here · Latest 50 messages</DialogDescription>
          </div>
        </header>
        {open && <ChatRoom username={username} chooseName={chooseName} ownIdsRef={ownIdsRef}
          onHistoryVisibilityChange={handleHistoryVisibilityChange} />}
      </DialogContent>
    </Dialog>
  );
}

function ChatRoom({ username, chooseName, ownIdsRef, onHistoryVisibilityChange }: {
  username: string;
  chooseName: (name: string) => void;
  ownIdsRef: { current: number[] };
  onHistoryVisibilityChange: (visible: boolean) => void;
}) {
  const [editingName, setEditingName] = useState(!username);
  const [draftName, setDraftName] = useState(username);
  const [ownIds, setOwnIds] = useState(() => new Set(ownIdsRef.current));
  const [message, setMessage] = useState('');
  const [validationError, setValidationError] = useState('');
  const historyRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const keepBottom = useRef(true);
  const client = useQueryClient();
  const nameSave = useMutation({ mutationFn: (username: string) => setChatName({ username }) });
  const key = getListChatMessagesQueryKey();
  const history = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => listChatMessages({ signal }),
    refetchInterval: 2000,
    staleTime: 0,
    enabled: !editingName,
  });
  const send = useMutation({
    mutationFn: (input: ChatMessageInput) => sendChatMessage(input),
    onSuccess: (sent) => {
      ownIdsRef.current = rememberSentChat(sent.id, ownIdsRef.current);
      setOwnIds(new Set(ownIdsRef.current));
      setMessage('');
      keepBottom.current = true;
      client.setQueryData<ChatMessage[]>(key, previous => [
        ...(previous ?? []).filter(item => item.id !== sent.id), sent,
      ].sort((a, b) => a.id - b.id).slice(-50));
      void client.invalidateQueries({ queryKey: key });
      requestAnimationFrame(() => composerRef.current?.focus());
    },
  });

  useEffect(() => {
    const element = historyRef.current;
    if (element && keepBottom.current) element.scrollTop = element.scrollHeight;
  }, [history.data, editingName]);

  useEffect(() => {
    onHistoryVisibilityChange(!editingName);
  }, [editingName, onHistoryVisibilityChange]);

  useEffect(() => {
    if (editingName) return;
    const frame = requestAnimationFrame(() => composerRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editingName]);

  useEffect(() => {
    const input = composerRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  }, [message, editingName]);

  async function submitName(event: FormEvent) {
    event.preventDefault();
    if (nameSave.isPending) return;
    const next = draftName.trim();
    if (!validChatName(next)) {
      setValidationError('Use 1–24 letters, numbers, underscores or hyphens.');
      return;
    }
    try {
      await nameSave.mutateAsync(next);
    } catch {
      setValidationError('Could not save your name. Check your connection and activity consent, then try again.');
      return;
    }
    chooseName(next);
    setDraftName(next);
    setValidationError('');
    keepBottom.current = true;
    setEditingName(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (send.isPending || !message.trim() || !validChatName(username)) return;
    setValidationError('');
    send.mutate({ username, message: message.trim() });
  }

  if (editingName) {
    return (
      <div className="chat-name-screen">
        <h3>{username ? 'Change your name' : 'What should we call you?'}</h3>
        <p>Choose the name everyone will see when you send a message. Saving also links this name to this browser’s visits in the owner’s private logs, including earlier visits. It is a display name, not a verified identity.</p>
        <form className="chat-name-form" onSubmit={submitName}>
          <label htmlFor="chat-username">Your name</label>
          <input id="chat-username" value={draftName} maxLength={24} autoComplete="nickname"
            disabled={nameSave.isPending}
            placeholder="Choose a name" autoFocus required
            onChange={event => { setDraftName(event.target.value); setValidationError(''); }} />
          <span className="chat-muted">1–24 letters, numbers, underscores or hyphens.</span>
          {validationError && <p className="chat-error" role="alert">{validationError}</p>}
          <button type="submit" className="chat-join" disabled={!draftName.trim() || nameSave.isPending}>
            {nameSave.isPending ? 'Saving…' : username ? 'Save name' : 'Continue to chat'}<ArrowRight size={16} />
          </button>
          {username && <button type="button" className="chat-name-cancel" disabled={nameSave.isPending} onClick={() => { setValidationError(''); setEditingName(false); }}>Cancel</button>}
        </form>
        <ChatDisclosure />
      </div>
    );
  }

  return (
    <>
      <div className="chat-identity">
        <span>Chatting as <strong>{username}</strong></span>
        <button type="button" aria-label="Change name" disabled={send.isPending}
          onClick={() => { setDraftName(username); setValidationError(''); setEditingName(true); }}>
          <Pencil size={12} /> Change name
        </button>
      </div>
      <div className="chat-history" ref={historyRef} aria-label="Chat history"
        onScroll={() => {
          const element = historyRef.current;
          if (element) keepBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
        }}>
        {history.isPending && <p className="chat-muted" role="status">Loading messages…</p>}
        {history.isError && <p role="alert">Could not refresh chat. <button type="button" onClick={() => void history.refetch()}>Retry</button></p>}
        {history.data?.length === 0 && <div className="chat-empty"><MessageCircle size={28} /><p>No messages yet</p><span>Send the first hello.</span></div>}
        {history.data?.map((item, index, items) => {
          const own = ownIds.has(item.id);
          const previous = items[index - 1];
          const startsDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(item.createdAt).toDateString();
          const grouped = !startsDay && previous?.username === item.username && ownIds.has(previous.id) === own;
          return (
            <div key={item.id} className={`chat-entry${own ? ' is-own' : ''}${grouped ? ' is-grouped' : ''}`}>
              {startsDay && <div className="chat-day"><span>{chatDay(item.createdAt)}</span></div>}
              <article className="chat-message" aria-label={`${own ? 'You' : item.username}: ${item.message}`} data-own={own}>
                {!grouped && <span className="chat-sender">{own ? `${item.username} · You` : item.username}</span>}
                <div className="chat-bubble">
                  <p>{item.message}</p>
                  <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </div>
              </article>
            </div>
          );
        })}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <label htmlFor="chat-message" className="sr-only">Message</label>
        <div className="chat-compose-row">
          <textarea ref={composerRef} id="chat-message" value={message} maxLength={1000} rows={1}
            placeholder="Message everyone…" readOnly={send.isPending} required
            onChange={event => { setMessage(event.target.value); send.reset(); }}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault();
                if (!send.isPending) event.currentTarget.form?.requestSubmit();
              }
            }} />
          <button type="submit" aria-label={send.isPending ? 'Sending message' : 'Send message'}
            disabled={send.isPending || !message.trim()}><Send size={18} /></button>
        </div>
        {send.error && <p className="chat-error" role="alert">{send.error instanceof Error ? send.error.message : 'Could not send. Please try again.'}</p>}
        <footer><span>Enter to send · Shift + Enter for a new line</span><span>{message.length}/1000</span></footer>
      </form>
      <ChatDisclosure compact />
    </>
  );
}

function chatDay(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function ChatDisclosure({ compact = false }: { compact?: boolean }) {
  const { consent } = useActivityConsent();
  const on = !!consent?.enabled;
  return (
    <p className={`chat-disclosure${compact ? ' chat-disclosure-compact' : ''}`} data-testid="text-chat-disclosure">
      {on
        ? 'Activity logging is required and on: the owner can see your messages, username and times linked to this browser’s random ID. Chat messages are visible to everyone who has access.'
        : 'Activity logging is not accepted. Browser and chat access are locked.'}
      {' Names aren’t verified—don’t share private information.'}
    </p>
  );
}
