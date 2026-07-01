import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Flame } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  delay?: number;
  accent?: boolean;
}

function StatCard({ label, value, delay = 0, accent }: StatCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setTimeout(() => setIsVisible(true), delay); observer.disconnect(); }
    }, { threshold: 0.1 });
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div ref={cardRef} className={cn('bg-white dark:bg-card rounded-2xl p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md',
      isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4', accent && 'ring-2 ring-primary/20')}>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-primary mt-1">{value}</p>
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
  formatNumber: (num: number) => string;
}

export function Stats({ todayTotal, weekTotal, monthTotal, allTimeTotal, bestDay, averagePerSession, currentStreak, longestStreak, formatNumber }: StatsProps) {
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

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Today" value={formatNumber(todayTotal)} delay={0} accent />
        <StatCard label="This Week" value={formatNumber(weekTotal)} delay={50} />
        <StatCard label="This Month" value={formatNumber(monthTotal)} delay={100} />
        <StatCard label="All Time" value={formatNumber(allTimeTotal)} delay={150} />
        <StatCard label="Best Day" value={bestDay.count > 0 ? `${formatNumber(bestDay.count)} (${formatBestDay()})` : '-'} delay={200} />
        <StatCard label="Avg/Session" value={averagePerSession > 0 ? formatNumber(averagePerSession) : '-'} delay={250} />
        <StatCard label="Current Streak" value={currentStreak > 0 ? `${currentStreak} days` : '-'} delay={300} />
        <StatCard label="Best Streak" value={longestStreak > 0 ? `${longestStreak} days` : '-'} delay={350} />
      </div>
    </div>
  );
}
