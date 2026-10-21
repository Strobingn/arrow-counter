import type { ArrowSession } from '../types/index.ts';

/** Calendar days are local to the archer, including logs saved by older UTC-based versions. */
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function shiftDay(key: string, offset: number): string {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + offset);
  return localDateKey(date);
}

export function sessionDay(session: Pick<ArrowSession, 'timestamp' | 'date'>): string {
  return Number.isFinite(session.timestamp) && !Number.isNaN(new Date(session.timestamp).getTime())
    ? localDateKey(new Date(session.timestamp))
    : session.date;
}

export function dayLabel(key: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  return dateFromKey(key).toLocaleDateString(undefined, options);
}
