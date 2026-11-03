// Pure date helpers on "YYYY-MM-DD" strings (no timezone math: the server already
// converts "now" into the game's timezone before calling these).

export function weekday(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday
}

export function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isWorkDay(date, workDays) {
  return workDays.includes(weekday(date));
}

export function previousWorkDay(date, workDays) {
  let d = addDays(date, -1);
  for (let i = 0; i < 7 && !isWorkDay(d, workDays); i++) d = addDays(d, -1);
  return d;
}

// Number of work days in a row, ending the work day before `date`, that are in `doneDates`.
export function streakBefore(date, doneDates, workDays) {
  let streak = 0;
  let d = previousWorkDay(date, workDays);
  while (doneDates.has(d) && streak < 366) {
    streak++;
    d = previousWorkDay(d, workDays);
  }
  return streak;
}

// The Sunday that starts the week of `date`; used as the key of the weekly vote.
export function weekKey(date) {
  return addDays(date, -weekday(date));
}
