import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Coin } from '../icons.jsx';
import { play } from './sound.js';
import { reducedMotion } from './motion.jsx';
import './fx.css';

// In-game replacements for window.confirm, plus the "coins fly to the balance" effect.
//   const { confirm, flyCoins } = useFx();
//   if (!(await confirm({ title, price, balance }))) return;
//   ...after the server said yes: flyCoins();
const FxContext = createContext({ confirm: async () => true, flyCoins: () => {} });
export const useFx = () => useContext(FxContext);

function ConfirmSheet({ req, onAnswer }) {
  const okRef = useRef(null);
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onAnswer(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAnswer]);

  const { title, icon, body, price, balance, okLabel = 'כן, קדימה', cancelLabel = 'לא עכשיו', priceLabel = 'מחיר' } = req;
  const hasMoney = typeof price === 'number';
  const left = hasMoney && typeof balance === 'number' ? balance - price : null;
  return (
    <div className="fx-sheet-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onAnswer(false); }}>
      <div className="fx-sheet" role="dialog" aria-modal="true" aria-labelledby="fx-sheet-title">
        {icon && <div className="fx-sheet-icon" aria-hidden="true">{icon}</div>}
        <h3 id="fx-sheet-title">{title}</h3>
        {body && <p className="fx-sheet-body">{body}</p>}
        {hasMoney && (
          <div className="fx-sheet-money">
            <div><span>{priceLabel}</span><b><Coin value={price} size={16} /></b></div>
            {left !== null && (
              <div className={left < 0 ? 'neg' : ''}><span>נשאר לך</span><b><Coin value={left} size={16} /></b></div>
            )}
          </div>
        )}
        <div className="fx-sheet-actions">
          <button ref={okRef} className="primary" onClick={(e) => onAnswer(true, e.currentTarget.getBoundingClientRect())}>{okLabel}</button>
          <button className="ghost" onClick={() => onAnswer(false)}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}

// A handful of coins flying from one rectangle to another (fixed position, pointer-events none).
function CoinFlight({ from, to, id }) {
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  const dx = to.left + to.width / 2 - fx;
  const dy = to.top + to.height / 2 - fy;
  return (
    <div className="fx-flight" key={id} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <i
          key={i}
          style={{
            left: fx, top: fy, '--dx': `${dx}px`, '--dy': `${dy}px`,
            '--arc': `${-60 - (i % 3) * 30}px`, '--jx': `${(i - 4) * 9}px`, animationDelay: `${i * 45}ms`,
          }}
        />
      ))}
    </div>
  );
}

export function FxProvider({ children }) {
  const [req, setReq] = useState(null);
  const [flights, setFlights] = useState([]);
  const resolver = useRef(null);
  const lastRect = useRef(null);

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    lastRect.current = null;
    play('blip');
    setReq(options);
  }), []);

  const answer = useCallback((yes, rect) => {
    if (rect) lastRect.current = rect;
    setReq(null);
    const r = resolver.current;
    resolver.current = null;
    r?.(yes);
  }, []);

  // Coins fly from where the player confirmed (or `fromEl`) to the header balance, which then rolls down.
  const flyCoins = useCallback((fromEl) => {
    play('purchase');
    const target = document.querySelector('[data-fx-balance]');
    const from = fromEl?.getBoundingClientRect?.() || lastRect.current;
    if (!target || !from || reducedMotion()) return;
    const id = Date.now() + Math.random();
    setFlights((f) => [...f, { id, from, to: target.getBoundingClientRect() }]);
    setTimeout(() => {
      setFlights((f) => f.filter((x) => x.id !== id));
      target.classList.remove('fx-hit');
      void target.offsetWidth; // restart the bump animation
      target.classList.add('fx-hit');
      play('coin');
    }, 800);
  }, []);

  return (
    <FxContext.Provider value={{ confirm, flyCoins }}>
      {children}
      {req && <ConfirmSheet req={req} onAnswer={answer} />}
      {flights.map((f) => <CoinFlight key={f.id} {...f} />)}
    </FxContext.Provider>
  );
}
