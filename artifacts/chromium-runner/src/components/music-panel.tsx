import { useRef } from 'react';
import { AlertCircle, LoaderCircle, Music, Pause, Play, Trash2, Upload, X } from 'lucide-react';
import { formatTime, type MusicPlayer } from '@/lib/use-music-player';
import { formatMiB } from '@/lib/music-validate';
import { MusicControls } from './music-controls';
import './music.css';

export function MusicPanel({ music }: { music: MusicPlayer }) {
  const input = useRef<HTMLInputElement>(null);
  const busy = music.status !== 'idle';
  return (
    <div className="music-panel" data-testid="panel-music">
      <p className="music-local-note" data-testid="text-music-local-note">
        Tracks stay in this browser only. Clearing site data removes them, and they do not sync to other devices.
      </p>
      <input ref={input} type="file" accept=".mp3,audio/mpeg" multiple hidden data-testid="input-music-files"
        onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) void music.addFiles(files); }} />
      <button type="button" className="music-add" disabled={busy} onClick={() => input.current?.click()} data-testid="button-music-add">
        {music.status === 'importing' ? <LoaderCircle size={15} className="turning" /> : <Upload size={15} />}
        <span>{music.status === 'importing' ? 'Checking and saving' : music.status === 'working' ? 'Updating library' : 'Add MP3 files'}</span>
      </button>
      <small className="music-usage" data-testid="text-music-usage">{music.tracks.length}/30 tracks · {formatMiB(music.usedBytes)} of 100 MB · 25 MB max each</small>
      {music.message && <p className="music-message" role="status" data-testid="status-music-message">{music.message}</p>}
      {music.errors.length > 0 && (
        <div className="music-errors" role="alert" data-testid="status-music-error">
          <AlertCircle size={14} />
          <ul>{music.errors.map((err, i) => <li key={i}>{err}</li>)}</ul>
          <button type="button" aria-label="Dismiss music errors" onClick={music.dismissErrors} data-testid="button-music-dismiss-error"><X size={13} /></button>
        </div>
      )}
      {music.status === 'loading' ? (
        <div className="music-skeleton" aria-label="Loading library"><i /><i /><i /></div>
      ) : music.tracks.length === 0 ? (
        <div className="music-empty" data-testid="text-music-empty"><Music size={18} /><span>No tracks yet. Add MP3s from your device.</span></div>
      ) : (
        <>
          <MusicControls music={music} idPrefix="music" />
          <ol className="music-list" aria-label="Music library">
            {music.tracks.map((track) => {
              const active = music.current?.id === track.id;
              return (
                <li key={track.id} className={active ? 'is-active' : ''} data-testid={`row-track-${track.id}`}>
                  <button type="button" className="music-row-play" aria-label={active && music.playing ? `Pause ${track.name}` : `Play ${track.name}`}
                    onClick={() => (active && music.playing ? music.pause() : void music.play(track.id))} data-testid={`button-track-play-${track.id}`}>
                    {active && music.playing ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <span className="music-row-name" title={track.name} data-testid={`text-track-name-${track.id}`}>{track.name}</span>
                  <span className="music-row-time">{formatTime(track.duration)}</span>
                  <button type="button" className="music-row-remove" aria-label={`Remove ${track.name}`} disabled={busy}
                    onClick={() => { if (window.confirm(`Remove "${track.name}" from this browser?`)) void music.remove(track.id); }} data-testid={`button-track-remove-${track.id}`}>
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ol>
          <button type="button" className="music-clear" disabled={busy} onClick={() => { if (window.confirm('Remove all tracks from this browser? This cannot be undone.')) void music.clearAll(); }} data-testid="button-music-clear">
            Clear library
          </button>
        </>
      )}
    </div>
  );
}
