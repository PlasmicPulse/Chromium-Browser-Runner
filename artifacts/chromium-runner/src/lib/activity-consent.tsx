import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getActivityConsent, getGetActivityConsentQueryKey, recordDeviceAccess, setActivityConsent, type ActivityConsent } from '@workspace/api-client-react';

const CHANNEL = 'chromium-runner-activity-consent';
const STORAGE_KEY = 'chromium-runner-activity-consent-ping';

type ConsentContextValue = {
  consent: ActivityConsent | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  setEnabled: (enabled: boolean) => void;
  saving: boolean;
  saveError: unknown;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ActivityConsentProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const key = getGetActivityConsentQueryKey();
  const channelRef = useRef<BroadcastChannel | null>(null);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getActivityConsent({ signal }),
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    staleTime: 15_000,
  });
  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await setActivityConsent({ enabled });
      const confirmed = await getActivityConsent();
      if (enabled && !confirmed.enabled) throw new Error('Enable cookies for this site, then accept activity logging to continue.');
      return confirmed;
    },
    onSuccess: (next) => {
      client.setQueryData(key, next);
      channelRef.current?.postMessage('changed');
      try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* storage optional */ }
    },
  });

  useEffect(() => {
    const refresh = () => { void client.invalidateQueries({ queryKey: getGetActivityConsentQueryKey() }); };
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = refresh;
      channelRef.current = channel;
    }
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) refresh(); };
    window.addEventListener('storage', onStorage);
    return () => { channel?.close(); channelRef.current = null; window.removeEventListener('storage', onStorage); };
  }, [client]);

  const optedIn = !!query.data?.enabled && !!query.data?.deviceId;
  useEffect(() => {
    if (!optedIn) return;
    const ping = () => { if (document.visibilityState === 'visible') void recordDeviceAccess().catch(() => undefined); };
    ping();
    const timer = window.setInterval(ping, 60_000);
    return () => window.clearInterval(timer);
  }, [optedIn]);

  const mutateRef = useRef(mutation.mutate);
  mutateRef.current = mutation.mutate;
  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;

  const value = useMemo<ConsentContextValue>(() => ({
    consent: query.data,
    isLoading: query.isPending,
    error: query.error,
    refetch: () => { void refetchRef.current(); },
    setEnabled: (enabled) => mutateRef.current(enabled),
    saving: mutation.isPending,
    saveError: mutation.error,
  }), [query.data, query.isPending, query.error, mutation.isPending, mutation.error]);

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useActivityConsent() {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useActivityConsent must be used inside ActivityConsentProvider');
  return ctx;
}
