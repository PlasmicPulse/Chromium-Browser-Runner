import { useState, type FormEvent } from 'react';
import { PanelsTopLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DEFAULT_TAB_APPEARANCE, tabIconUrl, type TabAppearance, type TabIcon } from '@/lib/tab-appearance';
import { useTabAppearance } from '@/lib/tab-appearance-context';
import './tab-disguise.css';

const presets: (TabAppearance & { label: string })[] = [
  { label: 'New Tab', title: 'New Tab', icon: 'blank' },
  { label: 'Word document', title: 'Document - Word', icon: 'word' },
  { label: 'Clever', title: 'Clever | Portal', icon: 'clever' },
];

export function TabDisguise() {
  const { appearance, save } = useTabAppearance();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(appearance);
  const [feedback, setFeedback] = useState('');
  function commit(value: TabAppearance) {
    const stored = save(value);
    setDraft(value);
    setFeedback(stored ? 'Tab appearance saved for this browser.' : 'Applied for this session. Your browser blocked saving preferences.');
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.title.trim()) commit({ ...draft, title: draft.title.trim() });
  }
  return (
    <Dialog open={open} onOpenChange={next => { setOpen(next); if (next) { setDraft(appearance); setFeedback(''); } }}>
      <DialogTrigger asChild>
        <button className="icon-button" type="button" aria-label="Tab disguise settings" title="Tab disguise" data-testid="button-tab-disguise"><PanelsTopLeft size={16} /><span className="tools-label">Tab disguise</span></button>
      </DialogTrigger>
      <DialogContent className="activity-settings-panel tab-disguise" onKeyDown={event => event.stopPropagation()}>
        <DialogTitle>Tab disguise</DialogTitle>
        <DialogDescription>Choose the title and icon shown in your browser’s tab list. Your choice stays the same on the owner dashboard and sign-in pages.</DialogDescription>
        <form onSubmit={submit} className="tab-disguise-form">
          <div className="tab-disguise-presets" aria-label="Tab presets">
            {presets.map(({ label, ...preset }) => <button className="consent-secondary" type="button" key={preset.icon} onClick={() => { setDraft(preset); setFeedback(''); }}><img src={tabIconUrl(preset.icon)} alt="" width={18} height={18} />{label}</button>)}
          </div>
          <label htmlFor="tab-disguise-title">Tab title</label>
          <input id="tab-disguise-title" data-testid="input-tab-title" autoComplete="off" value={draft.title} required maxLength={80} onChange={event => { setDraft({ ...draft, title: event.target.value }); setFeedback(''); }} />
          <label htmlFor="tab-disguise-icon">Tab icon</label>
          <select id="tab-disguise-icon" value={draft.icon} onChange={event => { setDraft({ ...draft, icon: event.target.value as TabIcon }); setFeedback(''); }}>
            <option value="blank">New Tab (blank)</option><option value="word">Word document</option><option value="clever">Clever</option>
          </select>
          <div className="tab-disguise-preview" aria-label="Tab preview"><img src={tabIconUrl(draft.icon)} alt="" width={17} height={17} /><span>{draft.title.trim() || 'Tab title'}</span><span aria-hidden="true">×</span></div>
          <p className="chat-muted">Changes only this site’s title and icon, not its URL, browsing history, activity logging, or access controls.</p>
          {feedback && <p role="status" className="tab-disguise-feedback">{feedback}</p>}
          <div className="consent-actions">
            <button className="consent-secondary" type="button" onClick={() => commit(DEFAULT_TAB_APPEARANCE)}>Reset to default</button>
            <button className="consent-primary" type="submit" disabled={!draft.title.trim()}>Save tab appearance</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
