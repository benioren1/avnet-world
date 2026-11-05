import { CalendarDays } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '../api.js';
import { useBusy } from '../useBusy.js';
import Avatar from '../Avatar.jsx';
import { COMPONENT_TYPES } from '../model.js';

const MAX = 5;
const TEMPLATES = {
  number: [
    { label: '📥 תוצרים', text: 'כמה תוצרים ייקלטו היום ב{c}?', unit: 'תוצרים' },
    { label: '📨 בקשות', text: 'כמה בקשות יקבל {c} היום?', unit: 'בקשות' },
    { label: '📤 ייצוא', text: 'כמה תוצרים ייצא {c} היום?', unit: 'תוצרים' },
    { label: '⚠️ שגיאות', text: 'כמה שגיאות יהיו ב{c} היום?', unit: 'שגיאות' },
    { label: '⏱️ זמן תגובה', text: 'מה יהיה זמן התגובה הממוצע של {c} היום (ms)?', unit: 'ms' },
  ],
  yesno: [
    { label: '🔥 תקלה', text: 'האם תהיה היום תקלה ב{c}?', unit: '' },
    { label: '🚀 דיפלוי', text: 'האם יהיה היום דיפלוי ל{c}?', unit: '' },
    { label: '📈 שיא', text: 'האם {c} ישבור היום שיא?', unit: '' },
  ],
};
const YESNO = { 1: 'כן', 0: 'לא' };
const showValue = (kind, v) => (kind === 'yesno' ? YESNO[v] : Number(v).toLocaleString());

// Yes / no picker used for answers (questions and bets).
function YesNoPicker({ value, onChange }) {
  return (
    <span className="yesno-picker">
      <button type="button" className={`chip-btn${value === 1 || value === '1' ? ' selected yes' : ''}`} onClick={() => onChange(1)}>✅ כן</button>
      <button type="button" className={`chip-btn${value === 0 || value === '0' ? ' selected no' : ''}`} onClick={() => onChange(0)}>❌ לא</button>
    </span>
  );
}

// ---- step 3: personal bets players opened today; the admin enters the real answer ----
const DUEL_STATUS = {
  pending: '⏳ מחכה שהצד השני יקבל',
  active: '⚔️ פעילה, מחכה לתשובה שלך',
  resolved: '✓ הוכרעה',
  declined: 'נדחתה',
  expired: 'פג תוקף',
  cancelled: 'בוטלה',
};

function DuelsSection({ date, flash }) {
  const [list, setList] = useState([]);
  const [answers, setAnswers] = useState({});
  const load = useCallback(() => adminApi.get(`/duels?date=${date}`).then((l) => {
    setList(l);
    setAnswers(Object.fromEntries(l.map((d) => [d.id, d.answer ?? ''])));
  }), [date]);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const resolve = (d) => {
    const answer = answers[d.id];
    if (answer === '' || answer === null || answer === undefined) return flash('❌ הכנס תשובה להתערבות');
    adminApi.post(`/duels/${d.id}/resolve`, { answer })
      .then((r) => { flash(r.winnerName ? `🏆 ${r.winnerName} ניצח/ה בהתערבות` : '🤝 תיקו, כל אחד קיבל את הכסף שלו'); load(); })
      .catch((e) => flash(`❌ ${e.message}`));
  };
  const cancel = (d) => window.confirm('לבטל את ההתערבות? שני הצדדים יקבלו את הכסף שלהם בחזרה.') && adminApi.post(`/duels/${d.id}/cancel`)
    .then(() => { flash('ההתערבות בוטלה והכסף הוחזר'); load(); })
    .catch((e) => flash(`❌ ${e.message}`));

  const shown = list.filter((d) => ['pending', 'active', 'resolved'].includes(d.status));
  if (!shown.length) return null;

  return (
    <section className="card">
      <div className="section-head">
        <h3 className="title-with-icon"><span className="step">3</span> ⚔️ התערבויות אישיות <span className="count-pill">{shown.length}</span></h3>
      </div>
      <p className="muted small">שאלות שהשחקנים כתבו ביניהם. הכנס את התשובה האמיתית, והקרוב יותר לוקח את הקופה. שאלה שאי אפשר לענות עליה אפשר לבטל, וכל אחד מקבל את הכסף שלו.</p>
      {shown.map((d) => (
        <div className="duel-admin" key={d.id}>
          <div className="duel-admin-head">
            <b>"{d.question}"</b>
            <span className="muted small">{DUEL_STATUS[d.status]} · קופה {d.stake * 2} דינרים</span>
          </div>
          <div className="duel-sides">
            <span className={`duel-side${d.winner === d.by ? ' winner' : ''}`}>
              <Avatar name={d.byName} photo={d.byPhoto} size={26} /> {d.byName}: <b>{showValue(d.kind, d.byGuess)}</b>
            </span>
            <span className="vs">מול</span>
            <span className={`duel-side${d.winner === d.target ? ' winner' : ''}`}>
              <Avatar name={d.targetName} photo={d.targetPhoto} size={26} /> {d.targetName}:
              <b>{d.targetGuess === null || d.targetGuess === undefined ? '—' : showValue(d.kind, d.targetGuess)}</b>
            </span>
          </div>
          {d.status !== 'pending' && (
            <div className="row wrap">
              {d.kind === 'yesno' ? (
                <YesNoPicker value={answers[d.id]} onChange={(v) => setAnswers((a) => ({ ...a, [d.id]: v }))} />
              ) : (
                <input
                  type="number"
                  className="answer-input"
                  placeholder="תשובה אמיתית"
                  value={answers[d.id] ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [d.id]: e.target.value }))}
                />
              )}
              <button className="primary" onClick={() => resolve(d)}>{d.status === 'resolved' ? 'עדכן הכרעה' : '🏁 הכרע'}</button>
              <button className="ghost danger" onClick={() => cancel(d)}>בטל</button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const formatDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });

function ComponentSelect({ architecture, value, onChange }) {
  const groups = useMemo(() => {
    const byDomain = {};
    architecture.nodes.forEach((n) => { (byDomain[n.data.domainId] ||= []).push(n); });
    return [
      ...architecture.domains.map((d) => ({ label: d.name, nodes: byDomain[d.id] || [] })),
      { label: 'ללא תחום', nodes: byDomain[''] || [] },
    ].filter((g) => g.nodes.length);
  }, [architecture]);

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— בחר רכיב —</option>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.nodes.map((n) => <option key={n.id} value={n.id}>{(COMPONENT_TYPES[n.data.type] || COMPONENT_TYPES.other).icon} {n.data.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export default function QuestionsPanel({ architecture, players, today }) {
  const [date, setDate] = useState(today);
  const [days, setDays] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [draft, setDraft] = useState({ componentId: '', text: '', unit: '', kind: 'number' });
  const [msg, setMsg] = useState('');

  const nodeById = useMemo(() => Object.fromEntries(architecture.nodes.map((n) => [n.id, n])), [architecture]);
  const playerById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  // The day being shown right now: a slow answer for a day the admin already left is dropped,
  // so day A's questions never appear (and get answered) under day B's heading.
  const shownDate = useRef(date);
  shownDate.current = date;
  const load = useCallback(async () => {
    const [q, d] = await Promise.all([adminApi.get(`/questions?date=${date}`), adminApi.get('/days')]);
    if (shownDate.current !== date) return;
    setQuestions(q.questions);
    setDays(d);
    // Answers the admin typed but hasn't published yet survive a reload (editing a question
    // or adding one reloads the list); the server's value fills only the empty fields.
    setAnswers((typed) => Object.fromEntries(q.questions.map((x) => {
      const mine = typed[x.id];
      return [x.id, mine !== undefined && String(mine).trim() !== '' ? mine : x.answer ?? ''];
    })));
  }, [date]);
  const [adding, guardAdd] = useBusy();
  useEffect(() => { load().catch((e) => flash(`❌ ${e.message}`)); }, [load]);

  // ok: a success message, or a function of the server's response that returns one.
  const run = (p, ok) => p
    .then(async (res) => {
      await load();
      const m = typeof ok === 'function' ? ok(res) : ok;
      if (m) flash(m);
    })
    .catch((e) => flash(`❌ ${e.message}`));

  const lateNote = (res) => (res.late ? '⏰ שעת הנעילה של היום עברה, אז לשאלה הזו יש שעה לניחושים מעכשיו' : '');

  const applyTemplate = (t) => {
    const name = nodeById[draft.componentId]?.data.name || '___';
    setDraft((d) => ({ ...d, text: t.text.replace('{c}', name), unit: t.unit }));
  };

  const add = (e) => {
    e.preventDefault();
    if (!draft.text.trim()) return;
    if (draft.text.includes('___')) return flash('❌ בחר רכיב, או השלם את החסר בטקסט');
    guardAdd(() => run(adminApi.post('/questions', { ...draft, date }).then((res) => { setDraft((d) => ({ componentId: '', text: '', unit: '', kind: d.kind })); return res; }), lateNote));
  };

  const previousDay = days.find((d) => d.date < date);
  const copyPrevious = () => run(
    adminApi.post('/questions/copy', { from: previousDay.date, to: date }),
    (res) => lateNote(res) || `שוכפלו השאלות מ-${formatDate(previousDay.date)}`,
  );

  const resolve = () => {
    const filled = Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== '' && v !== null));
    if (!Object.keys(filled).length) return flash('❌ לא הוזנו תשובות');
    const early = questions.some((q) => !q.locked && filled[q.id] !== undefined);
    if (early && !window.confirm('חלק מהשאלות עוד לא ננעלו. לפרסם בכל זאת? מי שעוד לא ניחש לא יוכל לנחש.')) return;
    run(adminApi.post(`/days/${date}/resolve`, { answers: filled }), (res) => (res.negative?.length
      ? `⚠️ התוצאות עודכנו, אבל ליתרה של ${res.negative.join(', ')} נכנסה למינוס (הם כבר הוציאו נקודות שירדו). הם לא יוכלו לקנות עד שירוויחו שוב`
      : '🎉 התוצאות פורסמו והנקודות חולקו!'));
  };

  const isToday = date === today;

  return (
    <div className="questions-layout">
      <aside className="days-list">
        <h3 className="title-with-icon"><CalendarDays size={15} /> ימים</h3>
        <button className={isToday ? 'active' : ''} onClick={() => setDate(today)}>היום</button>
        {days.filter((d) => d.date !== today).map((d) => (
          <button key={d.date} className={d.date === date ? 'active' : ''} onClick={() => setDate(d.date)}>
            <span>{formatDate(d.date)}</span>
            <span className={d.resolved === d.count ? 'ok' : 'warn'}>{d.resolved === d.count ? '✓' : `${d.resolved}/${d.count}`}</span>
          </button>
        ))}
      </aside>

      <div className="page-panel">
        <div className="panel-head">
          <div className="date-nav">
            <button className="ghost" onClick={() => setDate(shiftDate(date, -1))}>→</button>
            <h2>{isToday ? 'היום, ' : ''}{formatDate(date)}</h2>
            <button className="ghost" onClick={() => setDate(shiftDate(date, 1))}>←</button>
          </div>
          {msg && <span className="flash">{msg}</span>}
        </div>

        {/* ---- step 1: questions ---- */}
        <section className="card">
          <div className="section-head">
            <h3 className="title-with-icon"><span className="step">1</span> שאלות הבוקר <span className="count-pill">{questions.length}/{MAX}</span></h3>
            {previousDay && questions.length < MAX && (
              <button onClick={copyPrevious}>📋 שכפל מ-{formatDate(previousDay.date)}</button>
            )}
          </div>

          {questions.map((q, i) => (
            <div className="question-row" key={q.id}>
              <span className="q-num">{i + 1}</span>
              <div className="q-main">
                <input
                  defaultValue={q.text}
                  key={q.text}
                  readOnly={q.guesses.length > 0}
                  title={q.guesses.length > 0 ? 'כבר ניחשו על השאלה, אז אי אפשר לשנות אותה' : ''}
                  onBlur={(e) => e.target.value !== q.text && run(adminApi.patch(`/questions/${q.id}`, { text: e.target.value }))}
                />
                <div className="q-meta">
                  <span className="tag">{q.kind === 'yesno' ? '✅ כן/לא' : '🔢 מספר'}</span>
                  {q.componentId && <span className="tag">🧩 {nodeById[q.componentId]?.data.name || 'רכיב שנמחק'}</span>}
                  <span>{q.locked ? '🔒 נעול' : `🟢 פתוח לניחושים עד ${q.lockAt.slice(11)}`}</span>
                  <span>{q.guesses.length} ניחושים</span>
                </div>
              </div>
              {!q.resolved && (
                <button
                  className="ghost danger"
                  onClick={() => window.confirm('למחוק את השאלה וכל הניחושים עליה?') && run(adminApi.del(`/questions/${q.id}`))}
                >
                  🗑️
                </button>
              )}
            </div>
          ))}

          {questions.length < MAX && (
            <form className="add-question" onSubmit={add}>
              <div className="kind-toggle">
                <span className="muted small">סוג השאלה:</span>
                <button type="button" className={`chip-btn${draft.kind === 'number' ? ' selected' : ''}`} onClick={() => setDraft((d) => ({ ...d, kind: 'number' }))}>🔢 מספר</button>
                <button type="button" className={`chip-btn${draft.kind === 'yesno' ? ' selected' : ''}`} onClick={() => setDraft((d) => ({ ...d, kind: 'yesno', unit: '' }))}>✅ כן/לא</button>
                <span className="muted small">{draft.kind === 'yesno' ? 'תשובה נכונה = 50, ואם רוב הצוות טעה +30' : 'ניקוד לפי קרבה לתשובה, עד 100'}</span>
              </div>
              <ComponentSelect architecture={architecture} value={draft.componentId} onChange={(componentId) => setDraft((d) => ({ ...d, componentId }))} />
              <div className="templates">
                {TEMPLATES[draft.kind].map((t) => <button type="button" key={t.label} className="chip" onClick={() => applyTemplate(t)}>{t.label}</button>)}
              </div>
              <div className="row">
                <input placeholder="טקסט השאלה" value={draft.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
                {draft.kind === 'number' && (
                  <input className="unit" placeholder="יחידה" value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))} />
                )}
                <button className="primary" type="submit" disabled={adding}>+ הוסף</button>
              </div>
            </form>
          )}
        </section>

        {/* ---- step 2: answers ---- */}
        {questions.length > 0 && (
          <section className="card">
            <div className="section-head">
              <h3 className="title-with-icon"><span className="step">2</span> תשובות סוף היום</h3>
              <button className="primary" onClick={resolve}>🏁 פרסם תוצאות וחלק נקודות</button>
            </div>
            <p className="muted">אפשר לפרסם שוב אם טעית במספר. הניקוד מחושב מחדש בלי כפילויות.</p>

            {questions.map((q, i) => {
              const ranked = [...q.guesses].sort((a, b) => ((b.points ?? -1) + (b.bonus ?? 0)) - ((a.points ?? -1) + (a.bonus ?? 0)));
              return (
                <div className="answer-block" key={q.id}>
                  <div className="answer-head">
                    <span className="q-num">{i + 1}</span>
                    <span className="answer-q">{q.text}</span>
                    {q.kind === 'yesno' ? (
                      <YesNoPicker value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
                    ) : (
                      <>
                        <input
                          type="number"
                          className="answer-input"
                          placeholder="תשובה אמיתית"
                          value={answers[q.id] ?? ''}
                          onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                        />
                        <span className="muted">{q.unit}</span>
                      </>
                    )}
                    {q.resolved && <span className="ok">✓ פורסם</span>}
                  </div>
                  {q.locked && ranked.length > 0 && (
                    <div className="guess-chips">
                      {ranked.map((g) => {
                        const p = playerById[g.playerId];
                        return (
                          <span className="guess-chip" key={g.id}>
                            <Avatar name={p?.name} photo={p?.photo} size={22} />
                            {p?.name}: <b>{showValue(q.kind, g.value)}</b>
                            {typeof g.points === 'number' && <span className="pts">+{g.points + (g.bonus || 0)}</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {!q.locked && <p className="muted small">הניחושים יוצגו כאן אחרי הנעילה.</p>}
                </div>
              );
            })}
          </section>
        )}

        <DuelsSection date={date} flash={flash} />
      </div>
    </div>
  );
}
