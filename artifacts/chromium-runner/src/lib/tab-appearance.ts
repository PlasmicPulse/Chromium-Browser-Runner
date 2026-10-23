export type TabIcon = 'browser' | 'notes' | 'calculator' | 'blank';
export type TabAppearance = { title: string; icon: TabIcon };
export const TAB_APPEARANCE_KEY = 'runner-tab-appearance';
export const DEFAULT_TAB_APPEARANCE: TabAppearance = { title: 'Document 12', icon: 'browser' };
const icons: TabIcon[] = ['browser', 'notes', 'calculator', 'blank'];

export function normalizeTabAppearance(value: unknown): TabAppearance {
  if (!value || typeof value !== 'object') return DEFAULT_TAB_APPEARANCE;
  const candidate = value as Partial<TabAppearance>;
  return {
    title: typeof candidate.title === 'string' && candidate.title.trim()
      ? candidate.title.trim().slice(0, 80) : DEFAULT_TAB_APPEARANCE.title,
    icon: icons.includes(candidate.icon as TabIcon) ? candidate.icon as TabIcon : 'browser',
  };
}

export function readTabAppearance(): TabAppearance {
  try { return normalizeTabAppearance(JSON.parse(localStorage.getItem(TAB_APPEARANCE_KEY) ?? 'null')); }
  catch { return DEFAULT_TAB_APPEARANCE; }
}

export function tabIconUrl(icon: TabIcon): string {
  const drawing = {
    browser: '<circle cx="16" cy="16" r="11" fill="none" stroke="#315e51" stroke-width="2"/><path d="M5 16h22M16 5c-8 8-8 14 0 22M16 5c8 8 8 14 0 22" fill="none" stroke="#315e51" stroke-width="2"/>',
    notes: '<rect x="6" y="3" width="20" height="26" rx="3" fill="#f4c65b"/><path d="M10 11h12M10 16h12M10 21h8" stroke="#785a20" stroke-width="2"/>',
    calculator: '<rect x="5" y="2" width="22" height="28" rx="4" fill="#637485"/><rect x="9" y="6" width="14" height="7" rx="1" fill="#e2ecd7"/><path d="M10 18h2m4 0h2m4 0h1M10 24h2m4 0h2m4 0h1" stroke="white" stroke-width="3"/>',
    blank: '<rect width="32" height="32" fill="none"/>',
  }[icon];
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${drawing}</svg>`)}`;
}

export function applyTabAppearance(appearance: TabAppearance): void {
  document.title = appearance.title;
  // Replace competing favicon declarations so the browser consistently uses the chosen icon.
  document.head.querySelectorAll('link[rel~="icon"]').forEach(link => link.remove());
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/svg+xml';
  icon.href = tabIconUrl(appearance.icon);
  document.head.appendChild(icon);
}
