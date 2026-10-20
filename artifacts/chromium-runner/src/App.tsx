import { type FormEvent, type ReactNode } from 'react';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { getHealthCheckQueryKey, useHealthCheck, useRunBrowser } from '@workspace/api-client-react';
import { Activity, ArrowDownRight, ArrowUpRight, Check, CircleAlert, Clock3, Copy, ExternalLink, Globe2, LoaderCircle, LockKeyhole, ScanSearch, ShieldCheck, X } from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const [url, setUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [copied, setCopied] = useState(false);
  const runBrowser = useRunBrowser();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const result = runBrowser.data;
  const busy = runBrowser.isPending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      setFormError('Enter a complete URL, including https://');
      return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      setFormError('Only public HTTP and HTTPS web pages can be opened.');
      return;
    }
    runBrowser.mutate({ data: { url: parsed.toString() } });
  }

  async function copyFinalUrl() {
    if (!result?.finalUrl) return;
    try {
      await navigator.clipboard.writeText(result.finalUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const apiOnline = health.data?.status;

  return (
    <main className="runner-shell min-h-[100dvh] px-4 pb-16 sm:px-8">
      <div className="mx-auto max-w-[1100px]">
        <header className="flex h-[76px] items-center justify-between border-b border-[#d9d7cf]">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#244a4a] text-[#f5f0df]">
              <ScanSearch size={19} strokeWidth={2.1} />
            </div>
            <div className="leading-tight">
              <p className="text-[14px] font-extrabold tracking-[-.04em]">Chromium Runner</p>
              <p className="mono mt-1 text-[9px] uppercase tracking-[.16em] text-[#77817f]">Remote page inspection</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#d9d7cf] bg-[#faf9f5] px-3 py-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${health.isLoading ? 'animate-pulse bg-[#c18a3d]' : health.isError ? 'bg-[#c65b4d]' : 'bg-[#408b69]'}`} />
            <span className="mono text-[10px] tracking-[.04em] text-[#58656a]" data-testid="status-service">
              {health.isLoading ? 'CHECKING SERVICE' : health.isError ? 'SERVICE UNAVAILABLE' : `SERVICE ${String(apiOnline ?? 'READY').toUpperCase()}`}
            </span>
          </div>
        </header>

        <section className="grid gap-10 pb-9 pt-11 md:grid-cols-[1fr_270px] md:items-end md:pt-[66px]">
          <div className="slide-in">
            <div className="mono mb-4 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[.22em] text-[#a15a38]">
              <span className="h-px w-7 bg-[#c27850]" /> A browser, at arm’s length
            </div>
            <h1 className="max-w-[700px] text-[clamp(2.5rem,6vw,4.6rem)] font-semibold leading-[.99] tracking-[-.075em] text-[#26343c]">
              See what a page<br className="hidden sm:block" /> <span className="font-normal text-[#75817f]">actually looks like.</span>
            </h1>
            <p className="mt-5 max-w-[550px] text-[14px] leading-6 text-[#667276]">
              Open a public web page in a clean remote Chromium session. Get the rendered view and the details that matter, without setting up browser tooling.
            </p>
          </div>
          <div className="hidden border-l border-[#d5d2c8] pb-1 pl-5 md:block">
            <div className="mono text-[9px] uppercase tracking-[.2em] text-[#8c918a]">Session profile</div>
            <div className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-[#37484d]"><Globe2 size={15} className="text-[#477c73]" /> Fresh Chromium session</div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-[#7b8582]"><ShieldCheck size={14} /> Public web only</div>
          </div>
        </section>

        <section className="panel-shadow rounded-[18px] border border-[#e0ded6] bg-[#fbfaf6] p-5 sm:p-7">
          <form onSubmit={submit}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <label htmlFor="target-url" className="text-[13px] font-bold tracking-[-.02em] text-[#34434a]">Page to inspect</label>
              <span className="mono hidden text-[9px] uppercase tracking-[.14em] text-[#9a9e96] sm:block">HTTP / HTTPS</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className={`flex min-w-0 flex-1 items-center gap-3 rounded-[10px] border bg-white px-4 transition-colors focus-within:border-[#5c9587] focus-within:ring-2 focus-within:ring-[#5c9587]/15 ${formError ? 'border-[#d77664]' : 'border-[#d9dcd6]'}`}>
                <Globe2 size={17} className="shrink-0 text-[#8b9996]" />
                <input
                  id="target-url"
                  data-testid="input-target-url"
                  type="url"
                  value={url}
                  onChange={(event) => { setUrl(event.target.value); setFormError(''); }}
                  placeholder="https://example.com"
                  autoComplete="url"
                  required
                  className="h-[50px] min-w-0 flex-1 bg-transparent text-[14px] text-[#27383e] outline-none placeholder:text-[#a7aeaa]"
                  aria-describedby="url-guidance"
                />
                {url && <button type="button" onClick={() => { setUrl(''); setFormError(''); }} aria-label="Clear URL" data-testid="button-clear-url" className="grid h-7 w-7 place-items-center rounded-md text-[#9ba29c] hover:bg-[#f0f0e9] hover:text-[#3b4b4d]"><X size={15} /></button>}
              </div>
              <button
                type="submit"
                disabled={busy || !url.trim()}
                data-testid="button-run-browser"
                className="flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-[10px] bg-[#275c56] px-6 text-[13px] font-bold text-[#f8f4e8] transition-all hover:bg-[#1e4b46] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <><LoaderCircle size={16} className="animate-spin" /> Opening page…</> : <>Open in Chromium <ArrowUpRight size={16} /></>}
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p id="url-guidance" className="flex items-center gap-1.5 text-[11px] text-[#858e8a]"><LockKeyhole size={12} /> Only public HTTP and HTTPS pages are supported.</p>
              {formError && <p role="alert" className="text-[11px] font-semibold text-[#b45448]" data-testid="text-url-error">{formError}</p>}
            </div>
          </form>
        </section>

        {runBrowser.isError && (
          <div role="alert" data-testid="status-run-error" className="slide-in mt-5 flex items-start gap-3 rounded-xl border border-[#e6bdb2] bg-[#fff5f1] px-5 py-4 text-[#8b463d]">
            <CircleAlert size={18} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] font-bold">This page couldn’t be opened</p>
              <p className="mt-1 text-[12px] leading-5 text-[#98635b]">{runBrowser.error instanceof Error ? runBrowser.error.message : 'The remote browser could not load this address. Check the URL and try again.'}</p>
            </div>
          </div>
        )}

        {busy && (
          <section className="mt-7 grid gap-5 lg:grid-cols-[1.55fr_1fr]" aria-live="polite" data-testid="status-loading">
            <div className="overflow-hidden rounded-[15px] border border-[#d8d9d1] bg-[#fbfaf6]">
              <div className="flex h-10 items-center gap-2 border-b border-[#e4e3dc] px-4"><span className="h-2 w-2 rounded-full bg-[#d6d4cd]" /><span className="h-2 w-2 rounded-full bg-[#d6d4cd]" /><span className="h-2 w-2 rounded-full bg-[#d6d4cd]" /><span className="ml-3 h-4 w-1/2 animate-pulse rounded bg-[#ecebe4]" /></div>
              <div className="flex min-h-[300px] flex-col items-center justify-center bg-[#eeeee8] p-8">
                <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-full border border-[#d4d8cf] bg-[#f7f6f1] text-[#528177]"><LoaderCircle size={25} className="animate-spin" /><span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-[#d58c55]" /></div>
                <p className="text-[14px] font-bold text-[#44545a]">Starting a clean session</p>
                <p className="mt-2 text-[11px] text-[#87908c]">Navigating to the public page and capturing its render</p>
              </div>
            </div>
            <div className="space-y-3">
              {[0, 1, 2].map((item) => <div key={item} className="h-[88px] animate-pulse rounded-xl border border-[#e0ded6] bg-[#fbfaf6] p-4"><div className="h-2 w-16 rounded bg-[#e5e3db]" /><div className="mt-4 h-3 w-3/4 rounded bg-[#eeece5]" /></div>)}
            </div>
          </section>
        )}

        {result && !busy && (
          <section className="slide-in mt-8" data-testid="result-browser-run">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="mono mb-2 text-[9px] uppercase tracking-[.2em] text-[#9a6b4b]">Inspection result</div>
                <h2 className="max-w-[720px] truncate text-[20px] font-bold tracking-[-.045em] text-[#2d3b42]" data-testid="text-page-title">{result.title || 'Untitled page'}</h2>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-[#d7e5d9] bg-[#edf5ed] px-3 py-1.5 text-[#477554]" data-testid="status-http">
                <span className={`h-1.5 w-1.5 rounded-full ${result.status < 400 ? 'bg-[#509667]' : 'bg-[#c96c50]'}`} />
                <span className="mono text-[10px] font-medium">HTTP {result.status}</span>
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
              <div className="browser-window overflow-hidden rounded-[15px] border border-[#d4d6cf] bg-white">
                <div className="flex h-[42px] items-center gap-2 border-b border-[#e2e3de] bg-[#f8f8f4] px-3">
                  <span className="h-2 w-2 rounded-full bg-[#df8b7b]" /><span className="h-2 w-2 rounded-full bg-[#e5bb66]" /><span className="h-2 w-2 rounded-full bg-[#7cb18b]" />
                  <div className="mono ml-2 flex min-w-0 flex-1 items-center gap-2 rounded-md bg-[#eeefe9] px-3 py-1.5 text-[10px] text-[#687775]"><LockKeyhole size={10} className="shrink-0" /><span className="truncate">{result.finalUrl}</span></div>
                  <a href={result.finalUrl} target="_blank" rel="noreferrer" aria-label="Open final page in a new tab" data-testid="link-open-final-url" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#75827f] hover:bg-[#e9ece6]"><ExternalLink size={14} /></a>
                </div>
                <img src={result.screenshot} alt={`Screenshot of ${result.title || result.finalUrl}`} data-testid="img-browser-screenshot" className="block h-auto max-h-[610px] min-h-[220px] w-full object-contain object-top bg-[#e7e7e1]" />
              </div>
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[#e0ded6] bg-[#fbfaf6] p-4">
                    <div className="mono flex items-center gap-1.5 text-[9px] uppercase tracking-[.13em] text-[#8e9791]"><Clock3 size={12} /> Elapsed</div>
                    <p className="mono mt-3 text-[22px] font-medium tracking-[-.06em] text-[#33464a]" data-testid="text-elapsed-time">{result.elapsedMs.toLocaleString()}<span className="ml-1 text-[11px] text-[#828d88]">ms</span></p>
                  </div>
                  <div className="rounded-xl border border-[#e0ded6] bg-[#fbfaf6] p-4">
                    <div className="mono flex items-center gap-1.5 text-[9px] uppercase tracking-[.13em] text-[#8e9791]"><Activity size={12} /> Response</div>
                    <p className="mono mt-3 text-[22px] font-medium tracking-[-.06em] text-[#33464a]">{result.status}<span className="ml-1 text-[11px] text-[#828d88]">code</span></p>
                  </div>
                </div>
                <div className="rounded-xl border border-[#e0ded6] bg-[#fbfaf6] p-4">
                  <div className="mono mb-2 text-[9px] uppercase tracking-[.14em] text-[#8e9791]">Final destination</div>
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 break-all text-[11px] leading-5 text-[#4b6063]" data-testid="text-final-url">{result.finalUrl}</p>
                    <button type="button" onClick={copyFinalUrl} aria-label="Copy final URL" data-testid="button-copy-final-url" className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[#e2e2dc] text-[#71817c] hover:bg-[#f0f0ea]">{copied ? <Check size={13} /> : <Copy size={13} />}</button>
                  </div>
                  <div className="mt-3 border-t border-[#e8e6df] pt-2 text-[10px] text-[#929991]">Requested <span className="ml-1 break-all text-[#687876]" data-testid="text-requested-url">{result.requestedUrl}</span></div>
                </div>
                <div className="rounded-xl border border-[#e0ded6] bg-[#fbfaf6] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="mono text-[9px] uppercase tracking-[.14em] text-[#8e9791]">Page text excerpt</div>
                    <ArrowDownRight size={14} className="text-[#a2a59d]" />
                  </div>
                  <p className="max-h-[180px] overflow-auto whitespace-pre-wrap text-[12px] leading-[1.75] text-[#58666a]" data-testid="text-page-excerpt">{result.textExcerpt || 'No readable text was returned for this page.'}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {!result && !busy && !runBrowser.isError && (
          <section className="mt-7 flex min-h-[180px] flex-col items-center justify-center rounded-[15px] border border-dashed border-[#d3d5cc] bg-[#faf9f4]/80 px-6 py-8 text-center" data-testid="state-empty">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-full border border-[#d9ded5] bg-[#f1f2eb] text-[#52766d]"><Globe2 size={18} /></div>
            <h2 className="text-[13px] font-bold text-[#526064]">Your page preview will appear here</h2>
            <p className="mt-1.5 max-w-[330px] text-[11px] leading-5 text-[#8a938e]">Enter a public URL above to capture its rendered page, response details, and a readable text sample.</p>
          </section>
        )}

        <footer className="mt-9 flex flex-col gap-2 border-t border-[#d8d6ce] pt-4 text-[10px] text-[#858e88] sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2"><ShieldCheck size={13} className="text-[#66877a]" /> Runs in an isolated remote Chromium session</span>
          <span className="mono tracking-[.03em]">PUBLIC WEB ONLY <span className="mx-1 text-[#b0b1a8]">/</span> HTTP + HTTPS</span>
        </footer>
      </div>
    </main>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
