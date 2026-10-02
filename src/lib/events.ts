import data from '../content/pages/demonstrations.json';

export type DemoEvent = (typeof data.events)[number];

// Today's date in London, as YYYY-MM-DD. Evaluated when the site is built,
// so an event moves to "past" on the first deploy after its date.
function todayInLondon(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function splitEvents() {
  const today = todayInLondon();
  const withDate = data.events.filter((e) => e.isoDate);
  // Events without an isoDate stay in "upcoming" so nothing silently disappears.
  const upcoming = data.events
    .filter((e) => !e.isoDate || e.isoDate >= today)
    .sort((a, b) => (a.isoDate || '9999').localeCompare(b.isoDate || '9999'));
  const past = withDate
    .filter((e) => e.isoDate < today)
    .sort((a, b) => b.isoDate.localeCompare(a.isoDate));
  return { upcoming, past, nextEvent: upcoming[0] ?? null };
}
