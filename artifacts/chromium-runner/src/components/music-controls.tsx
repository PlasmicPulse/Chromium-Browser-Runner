import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { formatTime, type MusicPlayer } from '@/lib/use-music-player';

/** Shared transport: prev / play-pause / next, seek, and volume. */
export function MusicControls({ music, idPrefix }: { music: MusicPlayer; idPrefix: string }) {
  const empty = music.tracks.length === 0;
  return (
    <div className="music-controls">
      <div className="music-seek">
        <span data-testid={`${idPrefix}-text-time`}>{formatTime(music.time)}</span>
        <input type="range" min={0} max={Number.isFinite(music.duration) && music.duration > 0 ? music.duration : 1} step={0.1} value={Number.isFinite(music.time) ? Math.min(Math.max(0, music.time), Number.isFinite(music.duration) ? music.duration : 0) : 0}
          aria-label="Seek" aria-valuetext={`${formatTime(music.time)} of ${formatTime(music.duration)}`}
          disabled={!music.current} onChange={(e) => music.seek(Number(e.target.value))} data-testid={`${idPrefix}-input-seek`} />
        <span data-testid={`${idPrefix}-text-duration`}>{formatTime(music.duration)}</span>
      </div>
      <div className="music-transport">
        <button type="button" className="music-btn" aria-label="Previous track" disabled={empty} onClick={music.prev} data-testid={`${idPrefix}-button-prev`}><SkipBack size={15} /></button>
        <button type="button" className="music-btn is-main" aria-label={music.playing ? 'Pause' : 'Play'} disabled={empty} onClick={music.toggle} data-testid={`${idPrefix}-button-play`}>
          {music.playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button type="button" className="music-btn" aria-label="Next track" disabled={empty} onClick={music.next} data-testid={`${idPrefix}-button-next`}><SkipForward size={15} /></button>
        <button type="button" className="music-btn" aria-label={music.muted ? 'Unmute' : 'Mute'} aria-pressed={music.muted} onClick={music.toggleMute} data-testid={`${idPrefix}-button-mute`}>
          {music.muted || music.volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <input type="range" className="music-volume" min={0} max={1} step={0.05} value={music.muted ? 0 : music.volume}
          aria-label="Volume" aria-valuetext={`${Math.round((music.muted ? 0 : music.volume) * 100)}%`}
          onChange={(e) => music.setVolume(Number(e.target.value))} data-testid={`${idPrefix}-input-volume`} />
      </div>
    </div>
  );
}
