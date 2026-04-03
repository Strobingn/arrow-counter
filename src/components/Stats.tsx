import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  delay?: number;
}

function StatCard({ label, value, delay = 0 }: StatCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setIsVisible(true), delay);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={cardRef}
      className={cn(
        'bg-white rounded-2xl p-4 shadow-sm transition-all duration-300',
        'hover:-translate-y-0.5 hover:shadow-md',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
    >
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
  formatNumber: (num: number) => string;
}

export function Stats({ 
  todayTotal, 
  weekTotal, 
  monthTotal, 
  allTimeTotal,
  bestDay, 
  averagePerSession,
  formatNumber 
}: StatsProps) {
  const formatBestDay = () => {
    if (!bestDay.date) return '-';
    const date = new Date(bestDay.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard label="Today" value={formatNumber(todayTotal)} delay={0} />
      <StatCard label="This Week" value={formatNumber(weekTotal)} delay={50} />
      <StatCard label="This Month" value={formatNumber(monthTotal)} delay={100} />
      <StatCard label="All Time" value={formatNumber(allTimeTotal)} delay={150} />
      <StatCard 
        label="Best Day" 
        value={bestDay.count > 0 ? `${formatNumber(bestDay.count)} (${formatBestDay()})` : '-'} 
        delay={200} 
      />
      <StatCard 
        label="Avg/Session" 
        value={averagePerSession > 0 ? formatNumber(averagePerSession) : '-'} 
        delay={250} 
      />
    </div>
  );
}
