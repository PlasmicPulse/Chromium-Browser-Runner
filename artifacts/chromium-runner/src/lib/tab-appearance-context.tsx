import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { applyTabAppearance, normalizeTabAppearance, readTabAppearance, TAB_APPEARANCE_KEY, type TabAppearance } from './tab-appearance';

const TabContext = createContext<{
  appearance: TabAppearance;
  save: (appearance: TabAppearance) => boolean;
} | null>(null);

export function TabAppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(readTabAppearance);
  useLayoutEffect(() => applyTabAppearance(appearance), [appearance]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === TAB_APPEARANCE_KEY || event.key === null) setAppearance(readTabAppearance());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const save = (value: TabAppearance): boolean => {
    const next = normalizeTabAppearance(value);
    setAppearance(next);
    try { localStorage.setItem(TAB_APPEARANCE_KEY, JSON.stringify(next)); return true; }
    catch { return false; }
  };
  return <TabContext.Provider value={{ appearance, save }}>{children}</TabContext.Provider>;
}

export function useTabAppearance() {
  const context = useContext(TabContext);
  if (!context) throw new Error('Tab appearance provider is missing.');
  return context;
}
