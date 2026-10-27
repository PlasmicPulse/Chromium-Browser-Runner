import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

const THEME_PREFERENCE_KEY = 'chromium-runner-theme-v1';

type ThemePreferenceValue = {
  darkMode: boolean;
  toggleDarkMode: () => void;
};

const ThemePreferenceContext = createContext<ThemePreferenceValue | null>(null);

function readDarkModePreference(): boolean {
  try {
    return window.localStorage.getItem(THEME_PREFERENCE_KEY) === 'dark';
  } catch {
    return false;
  }
}

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [darkMode, setDarkMode] = useState(readDarkModePreference);
  const toggleDarkMode = useCallback(() => setDarkMode(value => !value), []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
    try {
      window.localStorage.setItem(THEME_PREFERENCE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // The selected theme still applies for this page view if storage is unavailable.
    }
  }, [darkMode]);

  const value = useMemo(() => ({ darkMode, toggleDarkMode }), [darkMode, toggleDarkMode]);

  return (
    <ThemePreferenceContext.Provider value={value}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemePreferenceValue {
  const value = useContext(ThemePreferenceContext);
  if (!value) throw new Error('useThemePreference must be used inside ThemePreferenceProvider');
  return value;
}
