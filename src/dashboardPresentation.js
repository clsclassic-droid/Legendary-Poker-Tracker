// Read-only projections for the dashboard; never write to the source data.
export function potHistory(sessions, pot = {}) {
  const day = value => String(value || '').slice(0, 10);
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(day(value));
  const transactions = pot.transactions || [];
  if (transactions.some(t => !valid(t.date))) return null;
  const amount = t => (t.type === 'expense' ? -1 : 1) * Math.abs(Number(t.amount) || 0);
  const opening = (Number(pot.balance) || 0) - transactions.reduce((sum, t) => sum + amount(t), 0);
  const ordered = [...transactions].sort((a,b) => day(a.date).localeCompare(day(b.date)));
  let balance = opening, index = 0;
  const firstDay = ordered.length ? day(ordered[0].date) : null;
  const eligible = firstDay ? sessions.filter(s => valid(s.date) && day(s.date) >= firstDay) : [];
  const points = [...eligible].sort((a,b) => day(a.date).localeCompare(day(b.date)) || Number(a.internalId)-Number(b.internalId)).map(s => {
    while (index < ordered.length && day(ordered[index].date) <= day(s.date)) balance += amount(ordered[index++]);
    return { session: s, balance };
  });
  return { opening, points, omitted: sessions.length - eligible.length };
}

export function rankMovement(current, previous) {
  const before = new Map(previous.map(e => [e.player, e.rank]));
  return current.map(e => ({ ...e, change: before.has(e.player) ? before.get(e.player) - e.rank : null }));
}
