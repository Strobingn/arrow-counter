import { useMemo } from 'react';
import { ArrowRight, Crosshair, Flame, Plus, Target } from 'lucide-react';
import type { ArrowSession, BowProfile } from '@/types';
import { Charts } from '@/components/Charts';
import { buildAnalytics } from '@/lib/analytics';
import { dayLabel } from '@/lib/dates';
import { useLocalDay } from '@/hooks/useLocalDay';

interface DashboardProps {
  sessions: ArrowSession[];
  bowProfiles: BowProfile[];
  defaultBow?: BowProfile;
  todayTotal: number;
  goal: number;
  currentStreak: number;
  allTimeTotal: number;
  formatNumber: (value: number) => string;
  onShoot: () => void;
  onInsights: () => void;
}

export function Dashboard({ sessions, bowProfiles, defaultBow, todayTotal, goal, currentStreak, allTimeTotal, formatNumber, onShoot, onInsights }: DashboardProps) {
  const today = useLocalDay();
  const week = useMemo(() => buildAnalytics(sessions, { days: 7, today, goal }), [sessions, today, goal]);
  const progress = Math.min(1, todayTotal / goal);
  const remaining = Math.max(0, goal - todayTotal);
  const circumference = 2 * Math.PI * 61;
  return <div className="dashboard space-y-5">
    <div className="page-heading"><div><p className="eyebrow">Your range journal</p><h1>Every arrow counts.</h1></div><span className="date-label">{dayLabel(today, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>
    <div className="hero-grid">
      <section className="daily-hero">
        <div className="hero-topline"><span><span className="status-dot" />TODAY'S PRACTICE</span><span className="streak-badge"><Flame size={14} />{currentStreak} day streak</span></div>
        <div className="hero-content">
          <div><div className="hero-count" aria-live="polite">{formatNumber(todayTotal)}</div><p className="hero-caption">arrows downrange</p><p className="hero-note">{remaining ? `${remaining} more to your daily goal.` : todayTotal === goal ? 'Daily goal reached.' : `${formatNumber(todayTotal - goal)} arrows beyond your goal.`}</p></div>
          <div className="hero-ring" role="img" aria-label={`${Math.round(todayTotal / goal * 100)} percent of your ${goal}-arrow daily goal`}>
            <svg viewBox="0 0 148 148" aria-hidden="true"><circle cx="74" cy="74" r="69" fill="none" stroke="#454545" strokeWidth="1" strokeDasharray="1 5" /><circle cx="74" cy="74" r="61" fill="none" stroke="#333333" strokeWidth="7" /><circle cx="74" cy="74" r="61" fill="none" stroke="#eeeeee" strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} transform="rotate(-90 74 74)" /><circle cx="74" cy="74" r="48" fill="none" stroke="#333333" strokeWidth="1" /></svg>
            <div><Target size={18} /><strong>{Math.round(todayTotal / goal * 100)}<small>%</small></strong><span>of {goal} arrows</span></div>
          </div>
        </div>
        <button className="primary-action" onClick={onShoot}><Plus size={18} />Log arrows<ArrowRight size={18} /></button>
      </section>
      <section className="setup-card">
        <div className="flex items-center justify-between"><p className="eyebrow">Active setup</p><Crosshair size={22} strokeWidth={1.3} /></div>
        <div><h2>{defaultBow?.name || 'Your bow belongs here.'}</h2><p>{defaultBow ? `${defaultBow.type} · default bow` : 'Open Equipment above to add your setup.'}</p></div>
        <div className="setup-specs"><div><span>Draw weight</span><strong>{defaultBow?.drawWeight || '—'}<small> lb</small></strong></div><div><span>Draw length</span><strong>{defaultBow?.drawLength || '—'}<small> in</small></strong></div><div><span>Arrow</span><strong>{defaultBow?.arrowWeight || '—'}<small> gr</small></strong></div></div>
        <div className="setup-footer"><Crosshair size={14} />{bowProfiles.length} {bowProfiles.length === 1 ? 'bow' : 'bows'} in your equipment locker</div>
      </section>
    </div>
    <div className="metric-strip overview-metrics">
      <div><span>Last 7 days</span><strong>{formatNumber(week.total)}</strong><small>{week.activeDays} practice days</small></div>
      <div><span>Score / arrow</span><strong>{week.average === null ? '—' : week.average.toFixed(2)}<em> / 10</em></strong><small>Last 7 days · {week.scored} scored</small></div>
      <div><span>Daily target</span><strong>{week.goalsMet}<em> / 7</em></strong><small>Days at current goal</small></div>
      <div><span>Lifetime arrows</span><strong>{formatNumber(allTimeTotal)}</strong><small>{sessions.length} logged sessions</small></div>
    </div>
    <div className="section-heading"><div><p className="eyebrow">The bigger picture</p><h2>Your week at a glance</h2></div><button className="text-action" onClick={onInsights}>All insights<ArrowRight size={16} /></button></div>
    <Charts sessions={sessions} bowProfiles={bowProfiles} goal={goal} formatNumber={formatNumber} compact />
  </div>;
}
