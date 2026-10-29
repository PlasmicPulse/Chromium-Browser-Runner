import { useId, useRef } from 'react';
import { AlertCircle, ImagePlus, LoaderCircle, Trash2, X } from 'lucide-react';
import type { NewTabBackground } from '@/lib/new-tab-background';

export function NewTabBackgroundSettings({ background }: { background: NewTabBackground }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const { url, info, fit, status, error, message, choose, remove, setFit, clearError } = background;
  const working = status !== 'idle';

  return (
    <div className="ntb-settings" data-testid="panel-newtab-background">
      <div className="ntb-head">
        <strong>New tab photo</strong>
        <small id={helpId}>JPG, PNG or WebP up to 10 MB. Saved in this browser only.</small>
      </div>
      <div className={`ntb-preview fit-${fit}`} aria-live="polite">
        {url ? <img src={url} alt="Current new tab background preview" data-testid="img-newtab-background-preview" />
          : <span>No photo set</span>}
        {working && <span className="ntb-working"><LoaderCircle size={16} className="turning" /> Preparing</span>}
      </div>
      {info && <p className="ntb-meta" data-testid="text-newtab-background-info">{info.width} x {info.height} px, {(info.bytes / 1024).toFixed(0)} KB</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="ntb-file"
        aria-describedby={helpId}
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void choose(file);
        }}
        data-testid="input-newtab-background"
      />
      <div className="ntb-actions">
        <button type="button" className="ntb-button" disabled={working} onClick={() => inputRef.current?.click()} aria-describedby={helpId} data-testid="button-newtab-background-choose">
          <ImagePlus size={14} /> {url ? 'Replace photo' : 'Choose photo'}
        </button>
        <button type="button" className="ntb-button is-quiet" disabled={working || !url} onClick={() => void remove()} data-testid="button-newtab-background-remove">
          <Trash2 size={14} /> Remove
        </button>
      </div>
      <div className="ntb-fit" role="radiogroup" aria-label="Photo fit">
        {(['cover', 'contain'] as const).map((option) => (
          <label key={option} className={fit === option ? 'is-on' : ''}>
            <input type="radio" name="ntb-fit" value={option} checked={fit === option} onChange={() => setFit(option)} data-testid={`radio-newtab-fit-${option}`} />
            {option === 'cover' ? 'Fill' : 'Fit whole'}
          </label>
        ))}
      </div>
      {error && (
        <p className="ntb-error" role="alert" data-testid="text-newtab-background-error">
          <AlertCircle size={13} /><span>{error}</span>
          <button type="button" aria-label="Dismiss photo error" onClick={clearError}><X size={12} /></button>
        </p>
      )}
      {!error && message && <p className="ntb-status" role="status">{message}</p>}
    </div>
  );
}
