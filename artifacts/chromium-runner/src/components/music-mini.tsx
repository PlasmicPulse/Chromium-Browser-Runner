import { useState } from 'react';
import { ChevronDown, ChevronUp, Music, Pause, Play } from 'lucide-react';
import type { MusicPlayer } from '@/lib/use-music-player';
import { MusicControls } from './music-controls';
import './music.css';

/** Always-available now-playing pill once a track is loaded; expands to full controls. */
export function MusicMini({ music }: { music: MusicPlayer }) {
  const [open, setOpen] = useState(false);
  if (!music.current) return null;
  return (
    <div className={`music-mini${open ? ' is-open' : ''}`} role="region" aria-label="Now playing" data-testid="panel-music-mini"
      onKeyDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="music-mini-bar">
        <button type="button" className="music-btn is-main" aria-label={music.playing ? 'Pause' : 'Play'} onClick={music.toggle} data-testid="mini-button-play">
          {music.playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <span className="music-mini-title" title={music.current.name} data-testid="text-now-playing">
          <Music size={12} aria-hidden="true" />{music.current.name}
        </span>
        <button type="button" className="music-btn" aria-expanded={open} aria-label={open ? 'Hide music controls' : 'Show music controls'} onClick={() => setOpen((v) => !v)} data-testid="mini-button-expand">
          {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </div>
      {open && <MusicControls music={music} idPrefix="mini" />}
    </div>
  );
}
