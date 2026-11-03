import {
  Activity, Database, DoorOpen, Download, Globe, Inbox, Lock, Monitor, Package, Puzzle, Settings2, Upload,
  Coins,
} from 'lucide-react';

// One icon per component type, shared by the editor, the city map and the shop.
const TYPE_ICONS = {
  ingest: Download,
  process: Settings2,
  export: Upload,
  access: Globe,
  api: DoorOpen,
  db: Database,
  queue: Inbox,
  storage: Package,
  ui: Monitor,
  monitor: Activity,
  other: Puzzle,
};

export function TypeIcon({ type, locked = false, size = 20 }) {
  const Icon = locked ? Lock : TYPE_ICONS[type] || Puzzle;
  return <Icon size={size} strokeWidth={1.8} />;
}

// Price / balance with a coin icon instead of an emoji.
export function Coin({ value, size = 13, className = '' }) {
  return (
    <span className={`coin ${className}`}>
      <Coins size={size} strokeWidth={2} />
      {value === undefined ? null : Number(value || 0).toLocaleString()}
    </span>
  );
}
