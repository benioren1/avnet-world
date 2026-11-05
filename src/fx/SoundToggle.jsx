import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isMuted, onMuteChange, play, setMuted } from './sound.js';

// Mute button for the player header. The choice is remembered in this browser.
export default function SoundToggle() {
  const [muted, setState] = useState(isMuted());
  useEffect(() => onMuteChange(setState), []);
  const toggle = () => {
    setMuted(!muted);
    if (muted) setTimeout(() => play('coin'), 30); // a sample, so the player hears it is back on
  };
  return (
    <button
      type="button"
      className={`ghost fx-sound${muted ? ' off' : ''}`}
      onClick={toggle}
      aria-pressed={!muted}
      aria-label={muted ? 'הפעל צלילים' : 'השתק צלילים'}
      title={muted ? 'הצלילים כבויים. לחץ להפעלה' : 'הצלילים פועלים. לחץ להשתקה'}
    >
      {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
    </button>
  );
}
