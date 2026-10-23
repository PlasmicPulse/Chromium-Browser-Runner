import { useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useActivityConsent } from '@/lib/activity-consent';
import { ConsentDetails } from '@/components/consent-copy';

export function ActivitySettings() {
  const [open, setOpen] = useState(false);
  const { consent, isLoading, error, refetch, setEnabled, saving, saveError } = useActivityConsent();
  const on = !!consent?.enabled;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={`icon-button activity-trigger ${on ? 'is-on' : ''}`} aria-label={`Activity logging settings (${on ? 'on' : 'off'})`} title="Activity logging" data-testid="button-activity-settings"><Fingerprint size={16} /><span className="tools-label">Activity settings</span></button>
      </DialogTrigger>
      <DialogContent className="activity-settings-panel" onKeyDown={event => event.stopPropagation()}>
        <DialogTitle>Activity logging</DialogTitle>
        <DialogDescription>Acceptance is required for browser and chat access. This setting applies to this browser only.</DialogDescription>
        {isLoading ? <p className="chat-muted" role="status">Loading your preference...</p>
          : error ? <p role="alert">Could not load your preference. <button type="button" className="consent-link" onClick={refetch}>Retry</button></p>
            : (
              <>
                <p className={`consent-state ${on ? 'is-on' : ''}`} data-testid="status-consent">
                  {on ? 'Logging is on for this browser.' : consent?.decided ? 'Logging is off for this browser.' : 'You have not chosen yet. Nothing is recorded.'}
                </p>
                {on && consent?.deviceId && <p className="consent-id">Browser ID <code data-testid="text-device-id">{consent.deviceId}</code></p>}
                <ConsentDetails />
                {on && <p className="chat-muted">Withdrawing acceptance ends your active browser session and locks the browser and chat. Entries already recorded are kept.</p>}
                {saveError ? <p className="consent-error" role="alert">Could not save your choice. Try again.</p> : null}
                <div className="consent-actions">
                  {on
                    ? <button type="button" className="consent-secondary" disabled={saving} onClick={() => setEnabled(false)} data-testid="button-consent-stop">{saving ? 'Saving...' : 'Withdraw acceptance and end session'}</button>
                    : <>
                      {!consent?.decided && <button type="button" className="consent-secondary" disabled={saving} onClick={() => setEnabled(false)} data-testid="button-consent-decline-settings">Decline</button>}
                      <button type="button" className="consent-primary" disabled={saving} onClick={() => setEnabled(true)} data-testid="button-consent-enable">{saving ? 'Saving...' : 'Accept and continue'}</button>
                    </>}
                </div>
              </>
            )}
      </DialogContent>
    </Dialog>
  );
}
