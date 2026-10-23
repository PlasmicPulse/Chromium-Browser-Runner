import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getListChatMessagesQueryKey, listChatMessages, sendChatMessage, type ChatMessage, type ChatMessageInput } from '@workspace/api-client-react';
import { ArrowRight, MessageCircle, Pencil, Send } from 'lucide-react';
import { useActivityConsent } from '@/lib/activity-consent';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { rememberSentChat, savedChatName, saveChatName, sentChatIds, validChatName } from '@/lib/chat-identity';

export function SiteChat() {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(savedChatName);
  const ownIdsRef = useRef(sentChatIds());

  function chooseName(name: string) {
    saveChatName(name);
    setUsername(name);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="icon-button" aria-label="Open community chat" title="Community chat" data-testid="button-chat"><MessageCircle size={17} /><span className="tools-label">Community chat</span></button>
      </DialogTrigger>
      <DialogContent className="site-chat" onKeyDown={event => event.stopPropagation()}>
        <header className="chat-room-header">
          <div className="chat-room-icon" aria-hidden="true"><MessageCircle size={21} /></div>
          <div>
            <DialogTitle>Community chat</DialogTitle>
            <DialogDescription>Everyone here · Latest 50 messages</DialogDescription>
          </div>
        </header>
        {open && <ChatRoom username={username} chooseName={chooseName} ownIdsRef={ownIdsRef} />}
      </DialogContent>
    </Dialog>
  );
}

function ChatRoom({ username, chooseName, ownIdsRef }: {
  username: string;
  chooseName: (name: string) => void;
  ownIdsRef: { current: number[] };
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

  function submitName(event: FormEvent) {
    event.preventDefault();
    const next = draftName.trim();
    if (!validChatName(next)) {
      setValidationError('Use 1–24 letters, numbers, underscores or hyphens.');
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
        <p>Choose the name everyone will see when you send a message.</p>
        <form className="chat-name-form" onSubmit={submitName}>
          <label htmlFor="chat-username">Your name</label>
          <input id="chat-username" value={draftName} maxLength={24} autoComplete="nickname"
            placeholder="Choose a name" autoFocus required
            onChange={event => { setDraftName(event.target.value); setValidationError(''); }} />
          <span className="chat-muted">1–24 letters, numbers, underscores or hyphens.</span>
          {validationError && <p className="chat-error" role="alert">{validationError}</p>}
          <button type="submit" className="chat-join" disabled={!draftName.trim()}>
            {username ? 'Save name' : 'Continue to chat'}<ArrowRight size={16} />
          </button>
          {username && <button type="button" className="chat-name-cancel" onClick={() => { setValidationError(''); setEditingName(false); }}>Cancel</button>}
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
