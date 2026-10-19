import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Flame, Target } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  delay?: number;
  accent?: boolean;
  progress?: number;
}

function StatCard({ label, value, delay = 0, accent, progress }: StatCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setTimeout(() => setIsVisible(true), delay); observer.disconnect(); }
    }, { threshold: 0.1 });
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [delay]);
  const pct = progress != null ? Math.min(1, Math.max(0, progress)) : null;
  return (
    <div ref={cardRef} className={cn('relative overflow-hidden bg-white dark:bg-card rounded-2xl p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md',
      isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4', accent && 'ring-2 ring-primary/20')}>
      {pct != null && (
        <div
          className="absolute inset-x-0 bottom-0 h-1 bg-primary/70 transition-all duration-700"
          style={{ width: `${pct * 100}%` }}
        />
      )}
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-primary mt-1">{value}</p>
    </div>
  );
}

interface GoalRingProps {
  todayTotal: number;
  goal: number;
  formatNumber: (num: number) => string;
}

function GoalRing({ todayTotal, goal, formatNumber }: GoalRingProps) {
  const pct = Math.min(1, goal > 0 ? todayTotal / goal : 0);
  const size = 132;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const remaining = Math.max(0, goal - todayTotal);
  return (
    <div className="flex items-center gap-4 bg-white dark:bg-card rounded-2xl p-4 shadow-sm">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke="hsl(var(--primary))" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-primary">{Math.round(pct * 100)}%</span>
          <span className="text-[10px] text-muted-foreground">of goal</span>
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
          <Target className="w-3.5 h-3.5 text-primary" /> Daily Goal
        </p>
        <p className="text-lg font-bold">
          {formatNumber(todayTotal)} <span className="text-sm font-normal text-muted-foreground">/ {formatNumber(goal)} arrows</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {pct >= 1 ? 'Goal crushed! 🎯' : `${formatNumber(remaining)} to go`}
        </p>
      </div>
    </div>
  );
}

interface StatsProps {
  todayTotal: number;
  weekTotal: number;
  monthTotal: number;
  allTimeTotal: number;
  bestDay: { date: string; count: number };
  averagePerSession: number;
  currentStreak: number;
  longestStreak: number;
  goal: number;
  formatNumber: (num: number) => string;
}

export function Stats({ todayTotal, weekTotal, monthTotal, allTimeTotal, bestDay, averagePerSession, currentStreak, longestStreak, goal, formatNumber }: StatsProps) {
  const formatBestDay = () => {
    if (!bestDay.date) return '-';
    return new Date(bestDay.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  return (
    <div className="space-y-3">
      {currentStreak > 0 && (
        <div className="flex items-center justify-center gap-1.5 py-2 px-3 bg-orange-50 dark:bg-orange-950/30 rounded-xl">
          <Flame className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">{currentStreak}-day shooting streak</span>
          {currentStreak >= longestStreak && <span className="text-xs text-orange-500 ml-1">(best!)</span>}
        </div>
      )}
      <GoalRing todayTotal={todayTotal} goal={goal} formatNumber={formatNumber} />
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Today" value={formatNumber(todayTotal)} delay={0} accent progress={goal > 0 ? todayTotal / goal : undefined} />
        <StatCard label="This Week" value={formatNumber(weekTotal)} delay={50} />
        <StatCard label="This Month" value={formatNumber(monthTotal)} delay={100} />
        <StatCard label="All Time" value={formatNumber(allTimeTotal)} delay={150} />
        <StatCard label="Best Day" value={bestDay.count > 0 ? `${formatNumber(bestDay.count)} (${formatBestDay()})` : '-'} delay={200} />
        <StatCard label="Avg/Session" value={averagePerSession > 0 ? formatNumber(averagePerSession) : '-'} delay={250} />
        <StatCard label="Current Streak" value={currentStreak > 0 ? `${currentStreak} days` : '-'} delay={300} progress={longestStreak > 0 ? currentStreak / longestStreak : undefined} />
        <StatCard label="Best Streak" value={longestStreak > 0 ? `${longestStreak} days` : '-'} delay={350} />
      </div>
    </div>
  );
}
