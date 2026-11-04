import { useState } from 'react';
import { Pickaxe } from 'lucide-react';
import { playerApi } from '../api.js';

// The morning mining button: open from mineOpen to mineClose on work days, once a day.
// A short pickaxe animation plays before the reward is revealed.
export default function MineButton({ mining, onMined, notify }) {
  const [swinging, setSwinging] = useState(false);
  const [reward, setReward] = useState(null); // { amount, gold, first, streak }

  const mine = async () => {
    setSwinging(true);
    try {
      const [res] = await Promise.all([playerApi.post('/mine'), new Promise((r) => setTimeout(r, 900))]);
      setReward(res);
      setTimeout(() => setReward(null), 3200);
      notify(res.gold
        ? `💎 גוש זהב! +${res.amount} דינרים`
        : `⛏️ +${res.amount} דינרים${res.first ? ' (כורה ראשון היום! 🥇)' : ''} · רצף ${res.streak} 🔥`);
      onMined();
    } catch (e) {
      notify(`❌ ${e.message}`);
    } finally {
      setSwinging(false);
    }
  };

  let state;
  if (mining.minedToday) {
    state = (
      <span className="mine-done" title={`רצף כרייה: ${mining.streak} ימים`}>
        <Pickaxe size={15} /> +{mining.minedToday.points}
        {mining.streak > 1 && <span className="streak">🔥{mining.streak}</span>}
      </span>
    );
  } else if (mining.open) {
    state = (
      <button className={`mine-btn${swinging ? ' swinging' : ''}`} onClick={mine} disabled={swinging} title={`פתוח עד ${mining.closesAt}`}>
        <span className="pick"><Pickaxe size={16} /></span> כרה +{mining.nextAmount}
      </button>
    );
  } else {
    state = (
      <span className="mine-closed" title={mining.workday ? `המכרה פתוח ${mining.opensAt}–${mining.closesAt}` : 'היום המכרה סגור'}>
        <Pickaxe size={15} /> {mining.workday ? `המכרה נפתח ב-${mining.opensAt}` : 'המכרה סגור היום'}
      </span>
    );
  }

  return (
    <div className="mine">
      {state}
      {reward && (
        <div className={`mine-reward${reward.gold ? ' gold' : ''}`} aria-live="polite">
          {reward.gold ? '💎' : '🪙'} +{reward.amount}
          {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--i': i }} />)}
        </div>
      )}
    </div>
  );
}
