import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalytics, scoreValue } from '../src/lib/analytics.ts';
import { localDateKey, sessionDay, shiftDay } from '../src/lib/dates.ts';

process.env.TZ = 'America/New_York';
const today = '2026-10-21';
const log = (day, count, extra = {}) => ({ id: `${day}-${count}`, timestamp: new Date(`${day}T12:00:00-04:00`).getTime(), date: day, arrowCount: count, ...extra });
const analyze = (sessions, extra = {}) => buildAnalytics(sessions, { days: 7, today, goal: 30, ...extra });

test('an empty range contains every day, zero volume, and no invented scores', () => {
  const data = analyze([]);
  assert.equal(data.daily.length, 7);
  assert.equal(data.daily[0].date, '2026-10-15');
  assert.equal(data.total, 0);
  assert.equal(data.average, null);
  assert.equal(data.changePercent, null);
  assert.ok(data.daily.every(day => day.average === null));
});

test('X counts as ten, misses count as zero, and blank/invalid scores are excluded', () => {
  const data = analyze([log(today, 6, { endScores: [{ id: 'end', arrows: ['X', '10', '5', 'M', null, 'invalid'] }] })]);
  assert.equal(data.scored, 4);
  assert.equal(data.average, 6.25);
  assert.equal(data.xRate, 25);
  assert.equal(data.distribution.find(item => item.score === 'M').arrows, 1);
  assert.equal(scoreValue(null), null);
});

test('score averages are weighted by scored arrows rather than sessions', () => {
  const data = analyze([log(today, 1, { endScores: [{ id: 'one', arrows: ['10'] }] }), log(today, 3, { endScores: [{ id: 'three', arrows: ['M', 'M', 'M'] }] })]);
  assert.equal(data.average, 2.5);
  assert.equal(data.daily.at(-1).average, 2.5);
});

test('date and bow filters apply to all metrics including the prior period', () => {
  const data = analyze([log('2026-10-14', 20, { bowId: 'a' }), log('2026-10-15', 30, { bowId: 'a', distance: 20, groupingQuality: 'tight' }), log(today, 10, { bowId: 'b' }), log('2026-10-22', 100, { bowId: 'a' })], { bowId: 'a' });
  assert.equal(data.total, 30);
  assert.equal(data.previousTotal, 20);
  assert.equal(data.changePercent, 50);
  assert.equal(data.activeDays, 1);
  assert.equal(data.goalsMet, 1);
  assert.equal(data.ratedSessions, 1);
  assert.equal(data.distances[0].arrows, 30);
  assert.deepEqual(data.bows, [{ id: 'a', arrows: 30 }]);
});

test('yards, meters, unassigned bows and missing distance remain distinct', () => {
  const data = analyze([log(today, 6, { distance: 20, distanceUnit: 'yards' }), log(today, 12, { distance: 20, distanceUnit: 'meters' }), log(today, 3)]);
  assert.deepEqual(data.distances.map(item => item.name), ['20 yd', '20 m']);
  assert.equal(data.missingDistance, 3);
  assert.equal(data.bows[0].id, 'unassigned');
  assert.equal(analyze([log(today, 6), log(today, 12, { bowId: 'a' })], { bowId: 'unassigned' }).total, 6);
});

test('older UTC-date logs are grouped by actual local shooting day', () => {
  const session = log(today, 6, { date: '2026-10-22', timestamp: new Date('2026-10-22T02:30:00Z').getTime() });
  assert.equal(sessionDay(session), today);
  assert.equal(analyze([session]).total, 6);
  assert.equal(localDateKey(new Date('2026-10-22T02:30:00Z')), today);
});

test('calendar-day iteration works across DST, month and year boundaries', () => {
  assert.equal(shiftDay('2026-11-01', 1), '2026-11-02');
  assert.equal(shiftDay('2026-03-08', -1), '2026-03-07');
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDay('2028-02-28', 1), '2028-02-29');
  const data = analyze([], { today: '2026-11-04' });
  assert.equal(new Set(data.daily.map(day => day.date)).size, 7);
});

test('longer ranges keep rest days and distinguish zero scores from no scores', () => {
  const data = analyze([log(today, 1, { endScores: [{ id: 'miss', arrows: ['M'] }] }), log(today, -5), log(today, NaN)], { days: 90 });
  assert.equal(data.daily.length, 90);
  assert.equal(data.total, 1);
  assert.equal(data.average, 0);
  assert.equal(data.daily.at(-2).average, null);
  assert.equal(data.daily.at(-1).average, 0);
});
