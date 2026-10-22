const NAME_KEY = 'chromium-runner-chat-username';
const SENT_KEY = 'chromium-runner-chat-sent-ids';

export const validChatName = (name: string): boolean => /^[a-zA-Z0-9_-]{1,24}$/.test(name);

export function savedChatName(): string {
  try {
    const name = localStorage.getItem(NAME_KEY)?.trim() ?? '';
    return validChatName(name) ? name : '';
  } catch { return ''; }
}

export function saveChatName(name: string): void {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* Keep the name in memory if storage is unavailable. */ }
}

export function sentChatIds(): number[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter(id => Number.isSafeInteger(id) && id > 0).slice(-100) : [];
  } catch { return []; }
}

export function rememberSentChat(id: number, previous: number[]): number[] {
  const next = [...previous.filter(value => value !== id), id].slice(-100);
  try { localStorage.setItem(SENT_KEY, JSON.stringify(next)); } catch { /* Local display history is optional. */ }
  return next;
}
