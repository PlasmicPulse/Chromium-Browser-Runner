export const MAX_TRACK_BYTES = 25 * 1024 * 1024;
export const MAX_LIBRARY_BYTES = 100 * 1024 * 1024;
export const MAX_TRACKS = 30;

export function formatMiB(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Cheap pre-checks that run before any decode. */
export function precheck(file: File): string | null {
  if (!/\.mp3$/i.test(file.name)) return `"${file.name}" is not an .mp3 file.`;
  if (file.type && !['audio/mpeg', 'audio/mp3', 'audio/mpeg3', 'audio/x-mpeg-3'].includes(file.type)) return `"${file.name}" does not report an MP3 audio type.`;
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_TRACK_BYTES) return `"${file.name}" is ${formatMiB(file.size)}. The limit is 25 MB per track.`;
  return null;
}

/** Validates an ID3v2 tag followed by an MPEG audio frame sync, or a bare frame sync. */
async function hasMp3Header(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  let offset = 0;
  if (head.length >= 10 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
    const size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
    offset = 10 + size + (head[5] & 0x10 ? 10 : 0);
  }
  const window = new Uint8Array(await file.slice(offset, offset + 4096).arrayBuffer());
  for (let i = 0; i + 1 < window.length; i += 1) {
    if (window[i] === 0xff && (window[i + 1] & 0xe0) === 0xe0) {
      const layer = (window[i + 1] >> 1) & 0x03;
      const version = (window[i + 1] >> 3) & 0x03;
      if (layer !== 0 && version !== 1) return true;
    }
  }
  return false;
}

function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); fn();
    };
    const timer = window.setTimeout(() => done(() => reject(new Error('timeout'))), 15000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      done(() => resolve(duration));
    };
    audio.onerror = () => done(() => reject(new Error('decode')));
    audio.src = url;
  });
}

export async function inspectMp3(file: File): Promise<{ duration: number }> {
  if (!new Audio().canPlayType('audio/mpeg')) throw new Error('This browser cannot play MP3 audio.');
  let headerOk: boolean;
  try { headerOk = await hasMp3Header(file); } catch { throw new Error(`"${file.name}" could not be read from disk.`); }
  if (!headerOk) throw new Error(`"${file.name}" does not contain MP3 audio. It may be renamed or corrupted.`);
  let duration: number;
  try { duration = await readDuration(file); } catch { throw new Error(`"${file.name}" appears to be corrupted and could not be opened for playback.`); }
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`"${file.name}" has no playable length.`);
  return { duration };
}

export function fingerprint(file: File): string {
  return `${file.name.toLowerCase()}|${file.size}|${file.lastModified}`;
}
