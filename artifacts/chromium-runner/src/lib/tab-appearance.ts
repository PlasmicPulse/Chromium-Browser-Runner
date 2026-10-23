export type TabIcon = 'word' | 'clever' | 'blank';
export type TabAppearance = { title: string; icon: TabIcon };
export const TAB_APPEARANCE_KEY = 'runner-tab-appearance';
export const DEFAULT_TAB_APPEARANCE: TabAppearance = { title: 'New Tab', icon: 'blank' };
const icons: TabIcon[] = ['word', 'clever', 'blank'];

export function normalizeTabAppearance(value: unknown): TabAppearance {
  if (!value || typeof value !== 'object') return DEFAULT_TAB_APPEARANCE;
  const candidate = value as Partial<TabAppearance>;
  const oldIcon = (value as { icon?: unknown }).icon;
  const title = typeof candidate.title === 'string' ? candidate.title.trim().slice(0, 80) : '';
  // Upgrade the old presets without replacing a visitor's custom title.
  const icon = oldIcon === 'notes' || (oldIcon === 'browser' && title === 'Document 12') ? 'word'
    : oldIcon === 'calculator' ? 'clever'
      : icons.includes(candidate.icon as TabIcon) ? candidate.icon as TabIcon : 'blank';
  return {
    title: oldIcon === 'notes' && title === 'Notes' ? 'Document - Word'
      : oldIcon === 'calculator' && title === 'Calculator' ? 'Clever | Portal'
        : title || DEFAULT_TAB_APPEARANCE.title,
    icon,
  };
}

export function readTabAppearance(): TabAppearance {
  try { return normalizeTabAppearance(JSON.parse(localStorage.getItem(TAB_APPEARANCE_KEY) ?? 'null')); }
  catch { return DEFAULT_TAB_APPEARANCE; }
}

export function tabIconUrl(icon: TabIcon): string {
  if (icon === 'word' || icon === 'clever') return `${import.meta.env.BASE_URL}icons/${icon}.png`;
  const drawing = '<rect width="32" height="32" fill="none"/>';
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${drawing}</svg>`)}`;
}

export function applyTabAppearance(appearance: TabAppearance): void {
  document.title = appearance.title;
  // Replace competing favicon declarations so the browser consistently uses the chosen icon.
  document.head.querySelectorAll('link[rel~="icon"]').forEach(link => link.remove());
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.type = appearance.icon === 'blank' ? 'image/svg+xml' : 'image/png';
  icon.href = tabIconUrl(appearance.icon);
  document.head.appendChild(icon);
}
