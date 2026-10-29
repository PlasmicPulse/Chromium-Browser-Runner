import { useState } from 'react';
import { Link } from 'wouter';
import { useAuth, useClerk } from '@clerk/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDownloadChatLogUrl, getDownloadVisitLogUrl, getGetOwnerAccessQueryKey, getListVisitorDevicesQueryKey,
  getOwnerAccess, listVisitorDevices, reviewVisitorDevices, type VisitorDevice,
} from '@workspace/api-client-react';
import { AlertCircle, ArrowLeft, Check, Copy, Download, LogOut, ShieldAlert } from 'lucide-react';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function Shell({ children, signedIn }: { children: React.ReactNode; signedIn?: boolean }) {
  const { signOut } = useClerk();
  return (
    <div className="owner-shell">
      <header className="owner-top">
        <Link href="/" className="owner-back" data-testid="link-back-browser"><ArrowLeft size={15} /> Browser</Link>
        <div className="owner-brand"><img src={`${basePath}/logo.svg`} alt="" width={26} height={26} /><span>Owner activity</span></div>
        {signedIn ? <button type="button" className="owner-ghost" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-logout"><LogOut size={14} /> Log out</button> : <span />}
      </header>
      <main className="owner-main">{children}</main>
    </div>
  );
}

export default function OwnerPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const access = useQuery({
    queryKey: getGetOwnerAccessQueryKey(),
    queryFn: ({ signal }) => getOwnerAccess({ signal }),
    enabled: isLoaded && !!isSignedIn,
  });

  if (!isLoaded || (isSignedIn && access.isPending)) {
    return <Shell><div className="owner-skeleton" role="status" aria-label="Checking access"><i /><i /><i /></div></Shell>;
  }
  if (!isSignedIn) {
    return (
      <Shell>
        <section className="owner-gate">
          <h1>Owner sign-in required</h1>
          <p>This page shows activity records for browsers that opted in. Sign in with the owner account to continue.</p>
          <Link href="/sign-in" className="consent-primary" data-testid="link-sign-in">Sign in</Link>
        </section>
      </Shell>
    );
  }
  if (access.isError) {
    return <Shell signedIn><section className="owner-gate" role="alert"><AlertCircle /><h1>Could not check access</h1><button type="button" className="consent-primary" onClick={() => void access.refetch()}>Retry</button></section></Shell>;
  }
  if (!access.data?.owner) {
    return (
      <Shell signedIn>
        <section className="owner-gate" role="alert" data-testid="status-access-denied">
          <ShieldAlert size={22} />
          <h1>Access denied</h1>
          <p>This account is signed in but is not the site owner. Activity records are only available to the owner.</p>
        </section>
      </Shell>
    );
  }
  return <Shell signedIn><Dashboard /></Shell>;
}

function fmt(iso: string) { return new Date(iso).toLocaleString(); }

function Dashboard() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: getListVisitorDevicesQueryKey({ page }),
    queryFn: ({ signal }) => listVisitorDevices({ page }, { signal }),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    placeholderData: prev => prev,
  });
  const review = useMutation({
    mutationFn: (ids: string[]) => reviewVisitorDevices({ deviceIds: ids.slice(0, 50) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['/api/owner/devices'] }),
  });
  const data = list.data;
  const shownNew = (data?.devices ?? []).filter(d => d.isNew).map(d => d.deviceId);
  const pages = data ? Math.max(1, Math.ceil(data.total / (data.pageSize || 50))) : 1;

  return (
    <>
      <section className="owner-hero">
        <div>
          <p className="owner-kicker">Consenting browsers</p>
          <h1>Visitor profiles</h1>
          <p className="owner-lede">Each row is a browser profile that chose to allow activity logging. It is not proof of a physical device: there is no IP, MAC or fingerprinting. Clearing cookies or using another browser creates a new ID.</p>
        </div>
        <div className="owner-stats">
          <div><span>Total</span><strong data-testid="text-total">{data?.total ?? '-'}</strong></div>
          <div className={data?.newCount ? 'is-new' : ''} role="status" aria-live="polite"><span>New</span><strong data-testid="text-new-count">{data?.newCount ?? '-'}</strong><em className="sr-only">{data ? `${data.newCount} new browsers awaiting review` : ''}</em></div>
        </div>
      </section>

      <section className="owner-downloads">
        <a className="owner-dl" href={getDownloadChatLogUrl()} download data-testid="link-download-chat"><Download size={15} /> Chat log (.txt)</a>
        <a className="owner-dl" href={getDownloadVisitLogUrl()} download data-testid="link-download-visits"><Download size={15} /> Visit log (.txt)</a>
        <p>Times in text files are UTC. Browser IDs match across the chat log, visit log and this list. Visit logs include the browser’s latest chosen chat name at export time, including for earlier visits; names are unverified and may change or match other visitors. Unnamed browsers show null. Chats sent before this feature, or by browsers that did not opt in, have no ID and are not attributed retroactively.</p>
      </section>

      <div className="owner-bar">
        <span className="chat-muted">{list.isFetching ? 'Refreshing...' : 'Checks every 10 seconds while open'}</span>
        <button type="button" className="consent-primary" disabled={!shownNew.length || review.isPending} onClick={() => review.mutate(shownNew)} data-testid="button-review">
          <Check size={14} /> {review.isPending ? 'Marking...' : `Mark ${shownNew.length} shown as reviewed`}
        </button>
      </div>
      {review.isError && <p className="consent-error" role="alert">Could not mark devices reviewed. Try again.</p>}

      {list.isPending ? <div className="owner-skeleton" role="status" aria-label="Loading devices"><i /><i /><i /><i /></div>
        : list.isError && !data ? <div className="owner-gate" role="alert"><p>Could not load devices.</p><button type="button" className="consent-primary" onClick={() => void list.refetch()}>Retry</button></div>
          : data && data.devices.length === 0 ? <div className="owner-empty"><h2>No consenting browsers yet</h2><p>When a visitor allows activity logging, their browser profile appears here.</p></div>
            : (
              <ul className="device-list">{data?.devices.map(d => <DeviceRow key={d.deviceId} d={d} />)}</ul>
            )}

      {pages > 1 && (
        <nav className="owner-pager" aria-label="Device pages">
          <button type="button" className="owner-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">Previous</button>
          <span>Page {page} of {pages}</span>
          <button type="button" className="owner-ghost" disabled={page >= pages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">Next</button>
        </nav>
      )}
    </>
  );
}

function DeviceRow({ d }: { d: VisitorDevice }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className={`device-row ${d.isNew ? 'is-new' : ''}`} data-testid={`row-device-${d.deviceId}`}>
      <div className="device-id">
        <code>{d.deviceId}</code>
        <button type="button" className="owner-ghost" aria-label={`Copy browser ID ${d.deviceId}`} onClick={() => { void navigator.clipboard?.writeText(d.deviceId).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }); }}>
          {copied ? <Check size={13} /> : <Copy size={13} />}<span className="sr-only">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="device-tags">
        <span className={`tag ${d.isNew ? 'tag-new' : ''}`}>{d.isNew ? 'New' : 'Reviewed'}</span>
        <span className={`tag ${d.consentActive ? 'tag-on' : 'tag-off'}`}>{d.consentActive ? 'Logging active' : 'Logging stopped'}</span>
      </div>
      <dl>
        <div><dt>Browser</dt><dd>{d.browser} on {d.platform}</dd></div>
        <div><dt>Last chat name</dt><dd>{d.username ?? 'None'}</dd></div>
        <div><dt>First seen</dt><dd><time dateTime={d.firstSeen}>{fmt(d.firstSeen)}</time></dd></div>
        <div><dt>Last seen</dt><dd><time dateTime={d.lastSeen}>{fmt(d.lastSeen)}</time></dd></div>
      </dl>
    </li>
  );
}
