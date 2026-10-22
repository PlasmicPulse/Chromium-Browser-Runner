import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { useActivityConsent } from '@/lib/activity-consent';
import { ConsentDetails } from '@/components/consent-copy';

export function ActivityAccessGate({ children }: { children: ReactNode }) {
  const { consent, isLoading, error, refetch, setEnabled, saving, saveError } = useActivityConsent();
  if (!isLoading && !error && consent?.enabled && consent.token) return <>{children}</>;

  return (
    <main className="activity-access-shell">
      <section className="activity-access-card" aria-labelledby="activity-access-title" data-testid="activity-access-gate">
        <div className="activity-access-icon"><ShieldCheck size={25} aria-hidden="true" /></div>
        <p className="activity-access-kicker">Chromium Browser Runner</p>
        <h1 id="activity-access-title">Activity logging is required</h1>
        <p className="activity-access-intro">To use this website’s browser and community chat, you must accept the activity logging described below.</p>
        <ConsentDetails />
        <p className="activity-access-retention">Only the site owner can access these activity records. Previously recorded entries are retained if you later withdraw acceptance.</p>
        {isLoading ? <p className="activity-access-status" role="status"><LoaderCircle size={16} className="turning" />Checking access…</p>
          : error ? (
            <div role="alert"><p className="consent-error">Could not verify activity logging acceptance. Access is locked until it can be checked.</p>
              <button type="button" className="consent-secondary" onClick={refetch}>Try again</button>
            </div>
          ) : (
            <>
              {consent?.decided && !consent.enabled && <p className="activity-access-status" role="status">Activity logging is not accepted. Browser and chat access are locked.</p>}
              {saveError ? <p className="consent-error" role="alert">{saveError instanceof Error ? saveError.message : 'Could not save your choice. Please try again.'}</p> : null}
              <div className="consent-actions">
                <button type="button" className="consent-secondary" disabled={saving} onClick={() => setEnabled(false)} data-testid="button-consent-decline">Decline</button>
                <button type="button" className="consent-primary" disabled={saving} onClick={() => setEnabled(true)} data-testid="button-consent-allow">{saving ? 'Checking…' : 'Accept and continue'}</button>
              </div>
            </>
          )}
        <Link href="/owner" className="activity-owner-link">Owner sign-in</Link>
      </section>
    </main>
  );
}
