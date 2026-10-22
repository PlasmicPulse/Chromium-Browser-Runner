import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getListChatMessagesQueryKey, listChatMessages, sendChatMessage, type ChatMessage, type ChatMessageInput } from '@workspace/api-client-react';
import { MessageCircle, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const USERNAME_KEY = 'chromium-runner-chat-username';

export function SiteChat() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="icon-button" aria-label="Open community chat" title="Community chat" data-testid="button-chat"><MessageCircle size={17} /></button>
      </DialogTrigger>
      <DialogContent className="site-chat" onKeyDown={event => event.stopPropagation()}>
        <DialogTitle>Community chat</DialogTitle>
        <DialogDescription>Shared with everyone using this website. Latest 50 messages. Names are not verified—don’t share private information.</DialogDescription>
        {open && <ChatRoom />}
      </DialogContent>
    </Dialog>
  );
}

function ChatRoom() {
  const [username, setUsername] = useState(() => {
    try { return localStorage.getItem(USERNAME_KEY) ?? ''; } catch { return ''; }
  });
  const [message, setMessage] = useState('');
  const [validationError, setValidationError] = useState('');
  const historyRef = useRef<HTMLDivElement>(null);
  const keepBottom = useRef(true);
  const client = useQueryClient();
  const key = getListChatMessagesQueryKey();
  const history = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => listChatMessages({ signal }),
    refetchInterval: 2000,
    staleTime: 0,
  });
  const send = useMutation({
    mutationFn: (input: ChatMessageInput) => sendChatMessage(input),
    onSuccess: (sent) => {
      setMessage('');
      keepBottom.current = true;
      client.setQueryData<ChatMessage[]>(key, previous => [
        ...(previous ?? []).filter(item => item.id !== sent.id), sent,
      ].sort((a, b) => a.id - b.id).slice(-50));
      void client.invalidateQueries({ queryKey: key });
    },
  });

  useEffect(() => {
    const element = historyRef.current;
    if (element && keepBottom.current) element.scrollTop = element.scrollHeight;
  }, [history.data]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^[a-zA-Z0-9_-]{1,24}$/.test(username.trim())) {
      setValidationError('Choose a username: 1–24 letters, numbers, underscores or hyphens.');
      return;
    }
    if (!message.trim()) return;
    setValidationError('');
    try { localStorage.setItem(USERNAME_KEY, username.trim()); } catch { /* Chat still works without local storage. */ }
    send.mutate({ username: username.trim(), message: message.trim() });
  }

  return (
    <>
      <div className="chat-history" ref={historyRef} aria-label="Chat history"
        onScroll={() => {
          const element = historyRef.current;
          if (element) keepBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
        }}>
        {history.isPending && <p className="chat-muted" role="status">Loading messages…</p>}
        {history.isError && <p role="alert">Could not refresh chat. <button type="button" onClick={() => void history.refetch()}>Retry</button></p>}
        {history.data?.length === 0 && <p className="chat-muted">No messages yet. Start the conversation.</p>}
        {history.data?.map(item => (
          <article className="chat-message" key={item.id}>
            <header><strong>{item.username}</strong><time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header>
            <p>{item.message}</p>
          </article>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <label htmlFor="chat-username">Your username</label>
        <input id="chat-username" value={username} maxLength={24} autoComplete="nickname" placeholder="Choose a name" onChange={event => { setUsername(event.target.value); send.reset(); }} disabled={send.isPending} required />
        <label htmlFor="chat-message">Message</label>
        <textarea id="chat-message" value={message} maxLength={1000} rows={3} placeholder="Say something…" onChange={event => { setMessage(event.target.value); send.reset(); }} disabled={send.isPending} required />
        {(validationError || send.error) && <p role="alert">{validationError || (send.error instanceof Error ? send.error.message : 'Could not send. Please try again.')}</p>}
        <footer><span>{message.length}/1000 · Updates every 2 seconds</span><button type="submit" disabled={send.isPending || !message.trim() || !username.trim()}><Send size={14} />{send.isPending ? 'Sending…' : 'Send'}</button></footer>
      </form>
    </>
  );
}
