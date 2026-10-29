import { useCallback, useEffect, useRef, useState } from 'react';
import { LimitError, clearTracks, deleteTrack, describeStorageError, listTracks, loadTrackBlob, saveTrack, type TrackMeta } from './music-db';
import { MAX_LIBRARY_BYTES, MAX_TRACKS, fingerprint, formatMiB, inspectMp3, precheck } from './music-validate';

export type MusicPlayer = ReturnType<typeof useMusicPlayer>;

export function useMusicPlayer() {
  const [tracks, setTracks] = useState<TrackMeta[]>([]);
  const [status, setStatus] = useState<'loading' | 'idle' | 'importing' | 'working'>('loading');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const aliveRef = useRef(true);
  const tracksRef = useRef<TrackMeta[]>([]);
  const genRef = useRef(0);
  const opRef = useRef(false);
  tracksRef.current = tracks;

  if (!audioRef.current && typeof Audio !== 'undefined') {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = 0.8;
    audioRef.current = audio;
  }

  const releaseUrl = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    const audio = audioRef.current!;
    const onTime = () => setTime(audio.currentTime);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => { if (audio.getAttribute('src')) { setPlaying(false); setErrors(['This track could not be played. It may be corrupted or unsupported by this browser.']); } };
    const onEnded = () => {
      setPlaying(false);
      const list = tracksRef.current;
      const index = list.findIndex((t) => t.id === audio.dataset.trackId);
      if (index >= 0 && index < list.length - 1) void playRef.current(list[index + 1].id);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);
    listTracks()
      .then((list) => { if (aliveRef.current) setTracks(list); })
      .catch(() => { if (aliveRef.current) setErrors(['Saved music is unavailable in this browser (private mode or storage blocked).']); })
      .finally(() => { if (aliveRef.current) setStatus('idle'); });
    return () => {
      aliveRef.current = false;
      genRef.current += 1;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
      releaseUrl();
    };
  }, [releaseUrl]);

  const unload = useCallback(() => {
    genRef.current += 1;
    const audio = audioRef.current!;
    audio.pause();
    audio.removeAttribute('src');
    delete audio.dataset.trackId;
    audio.load();
    releaseUrl();
    setCurrentId(null); setPlaying(false); setTime(0); setDuration(0);
  }, [releaseUrl]);

  const play = useCallback(async (id: string) => {
    const audio = audioRef.current!;
    const gen = ++genRef.current;
    setErrors([]);
    if (audio.dataset.trackId !== id) {
      let blob: Blob | null;
      try { blob = await loadTrackBlob(id); } catch (e) { if (gen === genRef.current) setErrors([describeStorageError(e, 'read')]); return; }
      if (!aliveRef.current || gen !== genRef.current || !tracksRef.current.some((t) => t.id === id)) return;
      if (!blob) { setErrors(['That track is missing from local storage. Remove it and add it again.']); return; }
      releaseUrl();
      urlRef.current = URL.createObjectURL(blob);
      audio.src = urlRef.current;
      audio.dataset.trackId = id;
      setCurrentId(id); setTime(0); setDuration(0);
    }
    if (gen !== genRef.current) return;
    try { await audio.play(); } catch (e) {
      if (gen !== genRef.current) return;
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setErrors(['Playback could not start. The file may be unsupported or playback was blocked.']);
    }
  }, [releaseUrl]);
  const playRef = useRef(play);
  playRef.current = play;

  const pause = useCallback(() => { genRef.current += 1; audioRef.current?.pause(); }, []);
  const toggle = useCallback(() => {
    const audio = audioRef.current!;
    if (!audio.paused) { genRef.current += 1; audio.pause(); }
    else if (audio.dataset.trackId) void play(audio.dataset.trackId);
    else if (tracksRef.current[0]) void play(tracksRef.current[0].id);
  }, [play]);

  const step = useCallback((delta: number) => {
    const list = tracksRef.current;
    if (!list.length) return;
    const index = list.findIndex((t) => t.id === audioRef.current?.dataset.trackId);
    const next = list[(index + delta + list.length) % list.length];
    if (next) void play(next.id);
  }, [play]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current!;
    if (!audio.dataset.trackId || !Number.isFinite(seconds)) return;
    const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const clamped = Math.min(Math.max(0, seconds), max);
    audio.currentTime = clamped; setTime(clamped);
  }, []);
  const setVolume = useCallback((value: number) => {
    const audio = audioRef.current!;
    audio.volume = value; setVolumeState(value);
    if (value > 0 && audio.muted) { audio.muted = false; setMuted(false); }
  }, []);
  const toggleMute = useCallback(() => {
    const audio = audioRef.current!;
    audio.muted = !audio.muted; setMuted(audio.muted);
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    if (opRef.current) return;
    opRef.current = true;
    try {
    let fresh: TrackMeta[];
    try { fresh = await listTracks(); } catch (e) { setErrors([describeStorageError(e, 'read')]); return; }
    if (!aliveRef.current) return;
    tracksRef.current = fresh; setTracks(fresh);
    setErrors([]); setMessage(''); setStatus('importing');
    const problems: string[] = [];
    let added = 0;
    const known = new Set(tracksRef.current.map((t) => t.fingerprint));
    let count = tracksRef.current.length;
    let total = tracksRef.current.reduce((sum, t) => sum + t.size, 0);
    for (const file of files) {
      const early = precheck(file);
      if (early) { problems.push(early); continue; }
      const print = fingerprint(file);
      if (known.has(print)) { problems.push(`"${file.name}" is already in your library.`); continue; }
      if (count >= MAX_TRACKS) { problems.push(`"${file.name}" was skipped. The library holds up to ${MAX_TRACKS} tracks.`); continue; }
      if (total + file.size > MAX_LIBRARY_BYTES) { problems.push(`"${file.name}" was skipped. It would push the library past 100 MB (${formatMiB(total)} used).`); continue; }
      try {
        const { duration: length } = await inspectMp3(file);
        const meta: TrackMeta = { id: crypto.randomUUID(), name: file.name.replace(/\.mp3$/i, ''), size: file.size, duration: length, fingerprint: print, addedAt: Date.now() };
        if (!aliveRef.current) return;
        try { await saveTrack(meta, file, { maxTracks: MAX_TRACKS, maxBytes: MAX_LIBRARY_BYTES }); } catch (e) { problems.push(e instanceof LimitError ? e.message : describeStorageError(e, 'saved')); continue; }
        if (!aliveRef.current) return;
        known.add(print); count += 1; total += file.size; added += 1;
        setTracks((list) => [...list, meta]);
      } catch (e) {
        problems.push(e instanceof Error ? e.message : `"${file.name}" could not be added.`);
      }
    }
    if (!aliveRef.current) return;
    setErrors(problems);
    if (added) setMessage(`${added} track${added === 1 ? '' : 's'} saved in this browser.`);
    } finally { opRef.current = false; if (aliveRef.current) setStatus('idle'); }
  }, []);

  const remove = useCallback(async (id: string) => {
    if (opRef.current) return;
    opRef.current = true; setStatus('working'); setErrors([]); setMessage('');
    if (audioRef.current?.dataset.trackId === id) unload(); else genRef.current += 1;
    try {
      try { await deleteTrack(id); } catch (e) { if (aliveRef.current) setErrors([describeStorageError(e, 'removed')]); return; }
      if (!aliveRef.current) return;
      tracksRef.current = tracksRef.current.filter((t) => t.id !== id);
      setTracks(tracksRef.current);
      setMessage('Track removed.');
    } finally { opRef.current = false; if (aliveRef.current) setStatus('idle'); }
  }, [unload]);

  const clearAll = useCallback(async () => {
    if (opRef.current) return;
    opRef.current = true; setStatus('working'); setErrors([]); setMessage('');
    unload();
    try {
      try { await clearTracks(); } catch (e) { if (aliveRef.current) setErrors([describeStorageError(e, 'cleared')]); return; }
      if (!aliveRef.current) return;
      tracksRef.current = []; setTracks([]); setMessage('Library cleared.');
    } finally { opRef.current = false; if (aliveRef.current) setStatus('idle'); }
  }, [unload]);

  const current = tracks.find((t) => t.id === currentId) ?? null;
  const usedBytes = tracks.reduce((sum, t) => sum + t.size, 0);

  return {
    tracks, status, current, playing, time, duration: duration || current?.duration || 0, volume, muted, errors, message, usedBytes,
    play, pause, toggle, next: () => step(1), prev: () => step(-1), seek, setVolume, toggleMute, addFiles, remove, clearAll,
    dismissErrors: () => setErrors([]),
  };
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
