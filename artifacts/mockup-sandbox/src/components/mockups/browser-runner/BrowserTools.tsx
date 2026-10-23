import { useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './browser-tools.css';

export function BrowserTools({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={toggle} type="button" className={`browser-tools-toggle ${open ? 'is-open' : ''}`}
        aria-label={open ? 'Collapse browser tools' : 'Expand browser tools'} aria-expanded={open}
        aria-controls="browser-tools-panel" data-testid="button-tools-toggle" onClick={() => setOpen(value => !value)}>
        {open ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
      <aside id="browser-tools-panel" className="browser-tools-panel" aria-label="Browser tools"
        hidden={!open} data-testid="panel-browser-tools"
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); }
        }}
        onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
        <header><p>YOUR WORKSPACE</p><h2>Browser tools</h2><span>More space for the page. Tools when you need them.</span></header>
        {children}
      </aside>
    </>
  );
}
