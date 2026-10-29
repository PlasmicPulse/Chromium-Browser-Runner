import { useCallback, useEffect, useRef, useState } from 'react';

/** Local-only new-tab photo. Stored as one bounded Blob record in IndexedDB on this browser. */
const DB_NAME = 'chromium-runner-local';
const STORE = 'new-tab-background';
const RECORD_KEY = 'current';
const FIT_KEY = 'chromium-runner-newtab-fit-v1';
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_STORED_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 50_000_000;
const MAX_SOURCE_EDGE = 16_384;
const TARGET_EDGE = 1920;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type BackgroundFit = 'cover' | 'contain';
type StoredRecord = { blob: Blob; width: number; height: number; savedAt: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('This browser does not support local photo storage.')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local photo storage could not be opened.'));
    request.onblocked = () => reject(new Error('Local photo storage is busy in another tab.'));
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? request.error);
      tx.onabort = () => reject(tx.error ?? new Error('The photo save was cancelled.'));
    });
  } finally { db.close(); }
}

function describeStorageError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'QuotaExceededError') return 'This browser is out of storage space for the photo. Free up site storage and try again.';
  return error instanceof Error && error.message ? `The photo could not be saved: ${error.message}` : 'The photo could not be saved in this browser.';
}

type Header = { type: string; width: number; height: number };

/** Reads dimensions from bounded header bytes only (no decode). Returns null when unrecognized. */
async function readHeader(file: File): Promise<Header | null> {
  const buf = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  const view = new DataView(buf.buffer);
  const ascii = (at: number, len: number) => String.fromCharCode(...buf.slice(at, at + len));
  if (buf.length >= 24 && buf[0] === 0x89 && ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR') {
    return { type: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (buf.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8X') {
      return { type: 'image/webp', width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)) };
    }
    if (chunk === 'VP8L' && buf[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return { type: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ' && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
      return { type: 'image/webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    return null;
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      if (marker === 0xff) { i += 1; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      if (marker === 0xd9 || marker === 0xda) return null;
      const length = view.getUint16(i + 2);
      if (length < 2) return null;
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { type: 'image/jpeg', width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
      i += 2 + length;
    }
  }
  return null;
}

function checkDimensions(width: number, height: number) {
  if (!width || !height) throw new Error('That image has no readable dimensions.');
  if (width > MAX_SOURCE_EDGE || height > MAX_SOURCE_EDGE || width * height > MAX_SOURCE_PIXELS) {
    throw new Error(`That image is ${width} x ${height} pixels, which is too large to process. Use one under 50 megapixels and 16384 px per side.`);
  }
}

async function decodable(blob: Blob): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

/** Validates, decodes with a pixel cap, downsizes to TARGET_EDGE and re-encodes. */
export async function prepareBackground(file: File): Promise<StoredRecord> {
  if (!TYPES.includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > MAX_INPUT_BYTES) throw new Error(`That photo is ${(file.size / 1048576).toFixed(1)} MB. The limit is 10 MB.`);
  if (file.size === 0) throw new Error('That file is empty.');
  const header = await readHeader(file);
  if (!header) throw new Error('That file is not a readable JPG, PNG, or WebP image, or its header is damaged.');
  if (header.type !== file.type) throw new Error('That file\'s contents do not match its image type.');
  checkDimensions(header.width, header.height);

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    try { await image.decode(); } catch { throw new Error('That image appears to be damaged and could not be opened.'); }
    const { naturalWidth: w, naturalHeight: h } = image;
    checkDimensions(w, h);
    const scale = Math.min(1, TARGET_EDGE / Math.max(w, h));
    const width = Math.max(1, Math.round(w * scale));
    const height = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the photo.');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    let blob = await encode('image/webp', 0.86);
    if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg', 0.86);
    if (blob && blob.size > MAX_STORED_BYTES) blob = await encode('image/jpeg', 0.7);
    canvas.width = 0; canvas.height = 0;
    if (!blob) throw new Error('This browser could not prepare the photo.');
    if (blob.size > MAX_STORED_BYTES) throw new Error('The prepared photo is still too large to store. Try a simpler image.');
    return { blob, width, height, savedAt: Date.now() };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadFit(): BackgroundFit {
  try { return window.localStorage.getItem(FIT_KEY) === 'contain' ? 'contain' : 'cover'; } catch { return 'cover'; }
}

export type NewTabBackground = ReturnType<typeof useNewTabBackground>;

export function useNewTabBackground() {
  const [url, setUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<{ width: number; height: number; bytes: number } | null>(null);
  const [fit, setFitState] = useState<BackgroundFit>(loadFit);
  const [status, setStatus] = useState<'loading' | 'idle' | 'working'>('loading');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const urlRef = useRef<string | null>(null);
  const aliveRef = useRef(true);

  const show = useCallback((record: StoredRecord | null) => {
    if (!aliveRef.current) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = record ? URL.createObjectURL(record.blob) : null;
    setUrl(urlRef.current);
    setInfo(record ? { width: record.width, height: record.height, bytes: record.blob.size } : null);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    const corrupt = 'The saved photo was unreadable and has been ignored. Choose a new one.';
    run<StoredRecord | undefined>('readonly', (store) => store.get(RECORD_KEY))
      .then(async (record) => {
        if (!aliveRef.current || !record) return;
        const valid = record.blob instanceof Blob && record.blob.size > 0 && record.blob.size <= MAX_STORED_BYTES
          && TYPES.includes(record.blob.type)
          && Number.isInteger(record.width) && Number.isInteger(record.height)
          && record.width > 0 && record.height > 0 && record.width <= TARGET_EDGE && record.height <= TARGET_EDGE;
        if (!valid) { setError(corrupt); return; }
        const decoded = await decodable(record.blob);
        if (!aliveRef.current) return;
        if (!decoded || decoded.width !== record.width || decoded.height !== record.height) { setError(corrupt); return; }
        show(record);
      })
      .catch(() => { if (aliveRef.current) setError('Saved photos are unavailable in this browser (private mode or storage blocked).'); })
      .finally(() => { if (aliveRef.current) setStatus('idle'); });
    return () => {
      aliveRef.current = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [show]);

  const choose = useCallback(async (file: File) => {
    setError(''); setMessage(''); setStatus('working');
    try {
      const record = await prepareBackground(file);
      try {
        await run('readwrite', (store) => store.put(record, RECORD_KEY));
      } catch (storageError) {
        throw new Error(describeStorageError(storageError));
      }
      if (!aliveRef.current) return;
      show(record);
      setMessage('Photo saved in this browser only.');
    } catch (problem) {
      if (aliveRef.current) setError(problem instanceof Error ? problem.message : 'The photo could not be used.');
    } finally { if (aliveRef.current) setStatus('idle'); }
  }, [show]);

  const remove = useCallback(async () => {
    setError(''); setMessage(''); setStatus('working');
    try {
      await run('readwrite', (store) => store.delete(RECORD_KEY));
      if (!aliveRef.current) return;
      show(null);
      setMessage('Background photo removed.');
    } catch {
      if (aliveRef.current) setError('The photo could not be removed from this browser storage.');
    } finally { if (aliveRef.current) setStatus('idle'); }
  }, [show]);

  const setFit = useCallback((next: BackgroundFit) => {
    setFitState(next);
    try { window.localStorage.setItem(FIT_KEY, next); } catch { setError('The fit setting will only last for this session.'); }
  }, []);

  return { url, info, fit, status, error, message, choose, remove, setFit, clearError: () => setError('') };
}
