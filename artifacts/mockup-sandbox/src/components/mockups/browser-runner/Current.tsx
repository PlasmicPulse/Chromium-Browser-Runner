import { useState } from 'react';
import type { CSSProperties } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeft, ArrowRight, Bookmark, Fingerprint, Globe2, LockKeyhole, Maximize2,
  MessageCircle, PanelsTopLeft, Radio, RotateCw, Send, ShieldCheck, Trash2, UserCog, X,
} from 'lucide-react';
import { BrowserTools } from './BrowserTools';
import { BookmarkPanel } from './bookmark-panel';
import { PetSidebar } from './pet-sidebar';
import './_group.css';

const sampleMessages = [
  { name: 'Mira', time: '10:41 AM', text: 'The little fern illustration is lovely 🌿' },
  { name: 'You', time: '10:43 AM', text: 'Right? I saved this one to come back to later.' },
  { name: 'Jonah', time: '10:46 AM', text: 'That color palette feels like a quiet Sunday morning.' },
];

const sampleBookmarks = [
  { id: 'fieldnotes', url: 'https://fieldnotes.studio/journal/slow-mornings', title: 'Slow mornings, well spent', savedAt: 1713012600000 },
  { id: 'are.na', url: 'https://www.are.na/', title: 'Are.na — a space for collecting', savedAt: 1712926200000 },
  { id: 'read.cv', url: 'https://read.cv/explore', title: 'Read.cv — people & work', savedAt: 1712839800000 },
];

const remotePage = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800">
<defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="#f6f5ef"/><stop offset="1" stop-color="#eee9dc"/></linearGradient><linearGradient id="art" x2="1" y2="1"><stop stop-color="#bacab0"/><stop offset=".52" stop-color="#d4b69a"/><stop offset="1" stop-color="#e9c88f"/></linearGradient></defs>
<rect width="1280" height="800" fill="url(#bg)"/><rect x="0" y="0" width="1280" height="63" fill="#fcfbf7"/><path d="M0 62.5h1280" stroke="#e4e0d6"/>
<text x="66" y="39" fill="#304940" font-family="Georgia,serif" font-size="22" font-weight="bold">fieldnotes</text><text x="195" y="38" fill="#718077" font-family="Arial,sans-serif" font-size="11" letter-spacing="2">JOURNAL</text>
<text x="900" y="37" fill="#64746b" font-family="Arial,sans-serif" font-size="12">Stories</text><text x="973" y="37" fill="#64746b" font-family="Arial,sans-serif" font-size="12">The shop</text><text x="1067" y="37" fill="#64746b" font-family="Arial,sans-serif" font-size="12">About us</text><circle cx="1195" cy="31" r="15" fill="#e8ece3"/><path d="M1190 31h10m-5-5v10" stroke="#42695a" stroke-width="1.5"/>
<text x="95" y="135" fill="#a36e4f" font-family="Arial,sans-serif" font-size="10" letter-spacing="2.8">A FIELD GUIDE TO SLOW LIVING</text>
<text x="95" y="195" fill="#2b4239" font-family="Georgia,serif" font-size="43">Slow mornings,</text><text x="95" y="245" fill="#2b4239" font-family="Georgia,serif" font-size="43" font-style="italic">well spent.</text>
<text x="98" y="287" fill="#6e7d73" font-family="Arial,sans-serif" font-size="14">A softer start is not a luxury. It is a small,</text><text x="98" y="310" fill="#6e7d73" font-family="Arial,sans-serif" font-size="14">daily way of finding your way back to yourself.</text>
<rect x="98" y="345" width="135" height="42" rx="4" fill="#42695a"/><text x="118" y="371" fill="#fff" font-family="Arial,sans-serif" font-size="12" letter-spacing=".4">READ THE STORY</text><path d="M210 366h10m-4-4 4 4-4 4" fill="none" stroke="#fff"/>
<rect x="600" y="105" width="570" height="335" rx="3" fill="url(#art)"/>
<circle cx="1015" cy="175" r="46" fill="#f3dfb7" opacity=".9"/><path d="M600 360q120-160 233-26t195-85q68-78 142 33v158H600Z" fill="#8ca38c"/><path d="M600 395q155-109 264-12t306-74v131H600Z" fill="#6f8c78"/>
<path d="M686 437q-10-122 60-193 45 63 26 194m113-2q-7-169 93-231 29 116-45 236m115-12q-3-100 57-141 30 90-24 151" fill="#506e5c" opacity=".8"/>
<rect x="623" y="460" width="520" height="12" rx="6" fill="#d8d7cb"/><rect x="623" y="460" width="168" height="12" rx="6" fill="#718c76"/>
<text x="98" y="535" fill="#a36e4f" font-family="Arial,sans-serif" font-size="10" letter-spacing="2.5">NOTES FROM THE FIELD</text>
<text x="98" y="578" fill="#31483e" font-family="Georgia,serif" font-size="27">A slower rhythm for the days ahead</text>
<text x="98" y="612" fill="#758179" font-family="Arial,sans-serif" font-size="13">Words by Rowan Ellis  ·  6 min read</text>
<path d="M95 643h1075" stroke="#deddd2"/><text x="98" y="686" fill="#68776d" font-family="Arial,sans-serif" font-size="12">Take a breath. Let the kettle sing. Leave the first few minutes of the day unclaimed.</text>
<rect x="1035" y="666" width="132" height="42" rx="21" fill="#fffdf8" stroke="#d9ded4"/><path d="M1060 681v12m-5-5 5 5 5-5" fill="none" stroke="#557267"/><text x="1076" y="692" fill="#65766d" font-family="Arial,sans-serif" font-size="11">Keep reading</text>
</svg>`;
const remotePageImage = `data:image/svg+xml,${encodeURIComponent(remotePage)}`;

function CommunityChat() {
  const [open, setOpen] = useState(true);
  const [message, setMessage] = useState('');
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="icon-button community-chat-trigger" aria-label="Open community chat" title="Community chat" data-testid="button-chat">
          <MessageCircle size={17} /><span className="tools-label">Community chat</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="browser-runner-portal browser-chat-overlay" />
        <Dialog.Content className="browser-runner-portal site-chat" onKeyDown={event => event.stopPropagation()}>
          <header className="chat-room-header">
            <div className="chat-room-icon" aria-hidden="true"><MessageCircle size={21} /></div>
            <div><Dialog.Title>Community chat</Dialog.Title><Dialog.Description>Everyone here · Latest 50 messages</Dialog.Description></div>
          </header>
          <div className="chat-identity"><span>Chatting as <strong>Rowan</strong></span><button type="button"><span>✎</span> Change name</button></div>
          <div className="chat-history" aria-label="Chat history">
            <div className="chat-day"><span>Today</span></div>
            {sampleMessages.map((item, index) => {
              const own = item.name === 'You';
              return <div className={`chat-entry${own ? ' is-own' : ''}`} key={`${item.name}-${index}`}>
                <article className="chat-message">
                  <span className="chat-sender">{own ? 'Rowan · You' : item.name}</span>
                  <div className="chat-bubble"><p>{item.text}</p><time>{item.time}</time></div>
                </article>
              </div>;
            })}
          </div>
          <form className="chat-form" onSubmit={event => { event.preventDefault(); setMessage(''); }}>
            <label className="sr-only" htmlFor="mockup-chat-message">Message</label>
            <div className="chat-compose-row">
              <textarea id="mockup-chat-message" rows={1} placeholder="Message everyone…" value={message} onChange={event => setMessage(event.target.value)} />
              <button type="submit" aria-label="Send message" disabled={!message.trim()}><Send size={18} /></button>
            </div>
            <footer><span>Enter to send · Shift + Enter for a new line</span><span>{message.length}/1000</span></footer>
          </form>
          <p className="chat-disclosure chat-disclosure-compact">Activity logging is on. Names aren’t verified—don’t share private information.</p>
          <Dialog.Close className="browser-chat-close" aria-label="Close chat"><X size={17} /></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Current() {
  return (
    <main className="runner-shell browser-runner-mockup">
      <section className="browser-app" aria-label="Remote browser">
        <div className="browser-chrome">
          <div className="toolbar">
            <div className="toolbar-navigation" role="group" aria-label="Browser navigation">
              <button className="icon-button" type="button" aria-label="Go back"><ArrowLeft size={17} /></button>
              <button className="icon-button" type="button" aria-label="Go forward"><ArrowRight size={17} /></button>
              <button className="icon-button" type="button" aria-label="Reload page"><RotateCw size={16} /></button>
            </div>
            <form className="address-form" onSubmit={event => event.preventDefault()} style={{ '--address-bar-color': '#f0f1eb', '--address-bar-ink': '#293b3d' } as CSSProperties} aria-label="Navigate to website">
              <LockKeyhole size={14} className="address-lock" aria-hidden="true" />
              <input aria-label="Website address" value="https://fieldnotes.studio/journal/slow-mornings" readOnly />
              <button type="button" className="bookmark-current is-saved" aria-label="Remove current page bookmark" aria-pressed="true"><Bookmark size={15} /></button>
              <button className="go-button" type="submit" aria-label="Navigate"><ArrowRight size={16} /></button>
            </form>
            <CommunityChat />
          </div>
          <BrowserTools>
            <section className="tools-section" aria-label="Workspace">
              <h3>Workspace</h3>
              <button type="button" className="icon-button" aria-label="Tab disguise"><PanelsTopLeft size={16} /><span className="tools-label">Tab disguise</span></button>
              <button type="button" className="icon-button"><Maximize2 size={17} /><span className="tools-label">Maximize display</span></button>
            </section>
            <section className="tools-section" aria-label="Bookmarks">
              <h3>Bookmarks</h3>
              <BookmarkPanel bookmarks={sampleBookmarks} onOpen={() => undefined} onRemove={() => undefined} />
            </section>
            <section className="tools-section" aria-label="Appearance">
              <h3>Appearance</h3>
              <label className="tools-color-control"><span>Search bar color</span><input type="color" aria-label="Search bar color" value="#f0f1eb" readOnly /></label>
              <button type="button" className="tools-color-reset">Reset color</button>
            </section>
            <section className="tools-section" aria-label="Session and settings">
              <h3>Session &amp; settings</h3>
              <button type="button" className="icon-button"><Fingerprint size={16} /><span className="tools-label">Activity settings</span></button>
              <button type="button" className="icon-button"><UserCog size={16} /><span className="tools-label">Owner dashboard</span></button>
              <button type="button" className="icon-button clear-profile-button" disabled><Trash2 size={15} /><span className="tools-label">Clear saved site data</span></button>
              <button type="button" className="new-session-button"><span className="new-session-plus">+</span><span className="new-session-label">New session</span></button>
            </section>
          </BrowserTools>
          <PetSidebar />
          <div className="viewport-frame">
            <div className="viewport-toolbar">
              <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
              <div className="tab-title"><Globe2 size={13} /><span>Slow mornings, well spent — fieldnotes</span></div>
              <div className="viewport-meta">
                <span className="profile-status profile-saved"><ShieldCheck size={13} /><span>SAVED TO THIS DEVICE</span></span>
                <span className="http-status">200</span>
              </div>
            </div>
            <div className="remote-viewport has-frame" role="application" aria-label="Interactive remote browser page: Slow mornings, well spent">
              <img className="remote-frame" src={remotePageImage} alt="Fieldnotes article about slow mornings" draggable={false} />
            </div>
            <div className="viewport-foot"><span><Radio size={12} /> LIVE SESSION</span><span>1280 × 800</span></div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Current;
