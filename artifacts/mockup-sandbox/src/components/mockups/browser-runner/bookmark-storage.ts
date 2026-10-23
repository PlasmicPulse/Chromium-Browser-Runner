const BOOKMARKS_KEY = "chromium-runner-bookmarks:v1";
const MAX_BOOKMARKS = 100;

export type Bookmark = {
  id: string;
  url: string;
  title: string;
  savedAt: number;
};

function sanitizeBookmark(value: unknown): Bookmark | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.url !== "string" || typeof record.title !== "string") return null;
  if (record.url.length > 4096 || !record.id || !record.title.trim()) return null;
  try {
    const url = new URL(record.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const savedAt = typeof record.savedAt === "number" && Number.isFinite(record.savedAt) ? record.savedAt : Date.now();
    return {
      id: record.id.slice(0, 100),
      url: url.toString(),
      title: record.title.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || url.hostname,
      savedAt,
    };
  } catch {
    return null;
  }
}

export function loadBookmarks(): Bookmark[] {
  try {
    const raw = window.localStorage.getItem(BOOKMARKS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, Bookmark>();
    for (const item of parsed) {
      const bookmark = sanitizeBookmark(item);
      if (bookmark && !unique.has(bookmark.url)) unique.set(bookmark.url, bookmark);
      if (unique.size >= MAX_BOOKMARKS) break;
    }
    return [...unique.values()];
  } catch {
    return [];
  }
}

export function saveBookmarks(bookmarks: Bookmark[]): boolean {
  try {
    const normalized = bookmarks
      .map(sanitizeBookmark)
      .filter((bookmark): bookmark is Bookmark => bookmark !== null)
      .slice(0, MAX_BOOKMARKS);
    window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function createBookmark(urlValue: string, titleValue: string): Bookmark | null {
  const bookmark = sanitizeBookmark({
    id: window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url: urlValue,
    title: titleValue,
    savedAt: Date.now(),
  });
  return bookmark;
}
