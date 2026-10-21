import type { ArrowSession, ScoreValue } from '../types/index.ts';
import { sessionDay, shiftDay } from './dates.ts';

export type AnalyticsPeriod = 7 | 30 | 90;
export const SCORE_LABELS = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M'] as const;

export function scoreValue(score: ScoreValue): number | null {
  if (score === null || !SCORE_LABELS.some(label => label === score)) return null;
  return score === 'X' ? 10 : score === 'M' ? 0 : Number(score);
}

export interface DailyActivity {
  date: string;
  arrows: number;
  sessions: number;
  scored: number;
  points: number;
  average: number | null;
}

export function buildAnalytics(sessions: ArrowSession[], options: {
  days: AnalyticsPeriod; today: string; goal: number; bowId?: string;
}) {
  const { days, today, goal, bowId } = options;
  const start = shiftDay(today, 1 - days);
  const previousStart = shiftDay(start, -days);
  const daily: DailyActivity[] = Array.from({ length: days }, (_, index) => ({
    date: shiftDay(start, index), arrows: 0, sessions: 0, scored: 0, points: 0, average: null,
  }));
  const dayMap = new Map(daily.map(day => [day.date, day]));
  const distribution = SCORE_LABELS.map(score => ({ score, arrows: 0 }));
  const scoreMap = new Map(distribution.map(item => [item.score as string, item]));
  const bows = new Map<string, number>();
  const distances = new Map<string, { name: string; arrows: number; meters: number }>();
  const groups = (['tight', 'good', 'loose', 'scatter'] as const).map(key => ({ key, sessions: 0 }));
  const filtered: ArrowSession[] = [];
  let previousTotal = 0;
  let missingDistance = 0;

  for (const session of sessions) {
    if (bowId && (session.bowId || 'unassigned') !== bowId) continue;
    if (!Number.isFinite(session.arrowCount) || session.arrowCount <= 0) continue;
    const date = sessionDay(session);
    if (date >= previousStart && date < start) previousTotal += session.arrowCount;
    const day = dayMap.get(date);
    if (!day) continue;
    filtered.push(session);
    day.arrows += session.arrowCount;
    day.sessions++;
    const bow = session.bowId || 'unassigned';
    bows.set(bow, (bows.get(bow) || 0) + session.arrowCount);
    if (session.distance && Number.isFinite(session.distance) && session.distance > 0) {
      const meters = session.distanceUnit === 'meters';
      const key = `${session.distance} ${meters ? 'm' : 'yd'}`;
      const item = distances.get(key) || { name: key, arrows: 0, meters: session.distance * (meters ? 1 : 0.9144) };
      item.arrows += session.arrowCount;
      distances.set(key, item);
    } else missingDistance += session.arrowCount;
    const group = groups.find(item => item.key === session.groupingQuality);
    if (group) group.sessions++;
    for (const end of session.endScores || []) {
      for (const score of end.arrows) {
        const value = scoreValue(score);
        if (value === null) continue; // Unentered arrows are not misses.
        day.points += value;
        day.scored++;
        const bucket = scoreMap.get(score!);
        if (bucket) bucket.arrows++;
      }
    }
  }

  daily.forEach(day => { day.average = day.scored ? day.points / day.scored : null; });
  const total = daily.reduce((sum, day) => sum + day.arrows, 0);
  const scored = daily.reduce((sum, day) => sum + day.scored, 0);
  const points = daily.reduce((sum, day) => sum + day.points, 0);
  return {
    daily, filtered, total, previousTotal, scored, distribution, missingDistance,
    average: scored ? points / scored : null,
    xRate: scored ? distribution[0].arrows / scored * 100 : null,
    changePercent: previousTotal > 0 ? (total - previousTotal) / previousTotal * 100 : null,
    activeDays: daily.filter(day => day.arrows > 0).length,
    goalsMet: daily.filter(day => day.arrows >= goal).length,
    bows: [...bows].map(([id, arrows]) => ({ id, arrows })).sort((a, b) => b.arrows - a.arrows),
    distances: [...distances.values()].sort((a, b) => a.meters - b.meters),
    groups,
    ratedSessions: groups.reduce((sum, group) => sum + group.sessions, 0),
  };
}
