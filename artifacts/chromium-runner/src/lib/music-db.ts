/** Local-only music library. Separate IndexedDB database so other local stores are never upgraded. */
const DB_NAME = 'chromium-runner-music';
const META = 'tracks';
const FILES = 'files';

export type TrackMeta = { id: string; name: string; size: number; duration: number; fingerprint: string; addedAt: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('This browser does not support local music storage.')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local music storage could not be opened.'));
    request.onblocked = () => reject(new Error('Local music storage is busy in another tab.'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Storage request failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Storage request was cancelled.'));
  });
}

export async function listTracks(): Promise<TrackMeta[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(META, 'readonly');
    const req = tx.objectStore(META).getAll();
    await txDone(tx);
    return (req.result as TrackMeta[]).filter((t) => t && typeof t.id === 'string').sort((a, b) => a.addedAt - b.addedAt);
  } finally { db.close(); }
}

export class LimitError extends Error {}

/** Re-checks duplicates and limits inside the write transaction so other tabs cannot cause overshoot. */
export async function saveTrack(meta: TrackMeta, blob: Blob, limits: { maxTracks: number; maxBytes: number }): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([META, FILES], 'readwrite');
    const done = txDone(tx);
    let limitError: LimitError | null = null;
    const req = tx.objectStore(META).getAll();
    req.onsuccess = () => {
      const existing = req.result as TrackMeta[];
      const bytes = existing.reduce((sum, t) => sum + (t.size || 0), 0);
      if (existing.some((t) => t.fingerprint === meta.fingerprint)) limitError = new LimitError(`"${meta.name}" is already in your library.`);
      else if (existing.length >= limits.maxTracks) limitError = new LimitError(`"${meta.name}" was skipped. The library holds up to ${limits.maxTracks} tracks.`);
      else if (bytes + meta.size > limits.maxBytes) limitError = new LimitError(`"${meta.name}" was skipped. It would push the library past 100 MB.`);
      if (limitError) { tx.abort(); return; }
      tx.objectStore(FILES).put(blob, meta.id);
      tx.objectStore(META).put(meta);
    };
    try { await done; } catch (e) { throw limitError ?? e; }
  } finally { db.close(); }
}

export async function loadTrackBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(FILES, 'readonly');
    const req = tx.objectStore(FILES).get(id);
    await txDone(tx);
    return req.result instanceof Blob ? req.result : null;
  } finally { db.close(); }
}

export async function deleteTrack(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([META, FILES], 'readwrite');
    tx.objectStore(META).delete(id);
    tx.objectStore(FILES).delete(id);
    await txDone(tx);
  } finally { db.close(); }
}

export async function clearTracks(): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([META, FILES], 'readwrite');
    tx.objectStore(META).clear();
    tx.objectStore(FILES).clear();
    await txDone(tx);
  } finally { db.close(); }
}

export function describeStorageError(error: unknown, action: string): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'QuotaExceededError') return `Browser storage is full, so the track could not be ${action}. Remove tracks or free site storage.`;
  return error instanceof Error && error.message ? `Track could not be ${action}: ${error.message}` : `Track could not be ${action} in this browser.`;
}
