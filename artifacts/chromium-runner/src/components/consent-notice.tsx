import { useState } from 'react';
import { ShieldQuestion, X } from 'lucide-react';
import { useActivityConsent } from '@/lib/activity-consent';
import { ConsentDetails } from '@/components/consent-copy';

export function ConsentNotice() {
  const { consent, setEnabled, saving, saveError } = useActivityConsent();
  const [hidden, setHidden] = useState(false);
  if (!consent || consent.decided || hidden) return null;
  return (
    <aside className="consent-notice" role="region" aria-label="Activity logging choice" data-testid="notice-consent">
      <div className="consent-notice-head">
        <ShieldQuestion size={16} aria-hidden="true" />
        <h2>Optional activity logging</h2>
        <button type="button" className="consent-close" aria-label="Hide for now" onClick={() => setHidden(true)} data-testid="button-consent-hide"><X size={14} /></button>
      </div>
      <ConsentDetails />
      {saveError ? <p className="consent-error" role="alert">Could not save your choice. Try again.</p> : null}
      <div className="consent-actions">
        <button type="button" className="consent-secondary" disabled={saving} onClick={() => setEnabled(false)} data-testid="button-consent-decline">Decline</button>
        <button type="button" className="consent-primary" disabled={saving} onClick={() => setEnabled(true)} data-testid="button-consent-allow">{saving ? 'Saving...' : 'Allow activity logging'}</button>
      </div>
    </aside>
  );
}
