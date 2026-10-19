import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import {
  Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, BarChart3, LineChart as LineIcon, PieChart as PieIcon, CalendarDays, MapPin } from 'lucide-react';
import type { ArrowSession } from '@/types';

interface ChartsProps {
  sessions: ArrowSession[];
  formatNumber: (num: number) => string;
}

const PIE_COLORS = ['#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

function ChartTooltip({ formatNumber }: { formatNumber: (n: number) => string }) {
  return {
    contentStyle: { borderRadius: '12px', fontSize: '12px', border: '1px solid hsl(var(--border))' },
    formatter: (v: number) => [`${formatNumber(v)} arrows`, 'Count'],
  };
}

export function Charts({ sessions, formatNumber }: ChartsProps) {
  const tooltipProps = useMemo(() => ChartTooltip({ formatNumber }), [formatNumber]);

  const weeklyData = useMemo(() => {
    const days: { name: string; arrows: number }[] = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = sessions.filter(s => s.date === dateStr).reduce((sum, s) => sum + s.arrowCount, 0);
      days.push({ name: dayNames[d.getDay()], arrows: count });
    }
    return days;
  }, [sessions]);

  const monthlyData = useMemo(() => {
    const weeks: { week: string; arrows: number }[] = [];
    const now = new Date();
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - i * 7 - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const count = sessions.filter(s => s.timestamp >= weekStart.getTime() && s.timestamp < weekEnd.getTime()).reduce((sum, s) => sum + s.arrowCount, 0);
      const label = `W${4 - i}`;
      weeks.push({ week: label, arrows: count });
    }
    return weeks;
  }, [sessions]);

  const dailyTrend = useMemo(() => {
    const dayMap = new Map<string, number>();
    sessions.forEach(s => { dayMap.set(s.date, (dayMap.get(s.date) || 0) + s.arrowCount); });
    return Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, arrows]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        arrows,
      }));
  }, [sessions]);

  const distanceData = useMemo(() => {
    const distMap = new Map<string, number>();
    sessions.forEach(s => {
      if (s.distance == null) return;
      const label = `${s.distance}${s.distanceUnit === 'meters' ? 'm' : 'yd'}`;
      distMap.set(label, (distMap.get(label) || 0) + s.arrowCount);
    });
    return Array.from(distMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ name: label, value }));
  }, [sessions]);

  const heatmap = useMemo(() => {
    const countMap = new Map<string, number>();
    sessions.forEach(s => { countMap.set(s.date, (countMap.get(s.date) || 0) + s.arrowCount); });
    const weeks: { date: string; count: number }[][] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - (11 * 7 + today.getDay()));
    const max = Math.max(1, ...countMap.values());
    for (let w = 0; w < 12; w++) {
      const week: { date: string; count: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        const dateStr = day.toISOString().split('T')[0];
        week.push({ date: dateStr, count: countMap.get(dateStr) || 0 });
      }
      weeks.push(week);
    }
    return { weeks, max };
  }, [sessions]);

  const totalArrows = sessions.reduce((sum, s) => sum + s.arrowCount, 0);

  if (sessions.length === 0) {
    return (
      <Card className="p-4 rounded-2xl">
        <p className="text-sm text-muted-foreground text-center py-4">Shoot some arrows to see charts!</p>
      </Card>
    );
  }

  const heatColor = (count: number) => {
    if (count === 0) return 'bg-muted';
    const intensity = Math.min(1, count / heatmap.max);
    if (intensity > 0.75) return 'bg-primary';
    if (intensity > 0.5) return 'bg-primary/70';
    if (intensity > 0.25) return 'bg-primary/50';
    return 'bg-primary/30';
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 rounded-2xl">
        <Tabs defaultValue="weekly">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-primary" /> Trends
            </h3>
            <TabsList className="h-7">
              <TabsTrigger value="weekly" className="text-xs px-2 py-0.5"><BarChart3 className="w-3 h-3 mr-1" />7-Day</TabsTrigger>
              <TabsTrigger value="monthly" className="text-xs px-2 py-0.5">4-Wk</TabsTrigger>
              <TabsTrigger value="trend" className="text-xs px-2 py-0.5"><LineIcon className="w-3 h-3 mr-1" />14-Day</TabsTrigger>
              <TabsTrigger value="distance" className="text-xs px-2 py-0.5"><PieIcon className="w-3 h-3 mr-1" />Distance</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="weekly">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={weeklyData}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip {...tooltipProps} />
                <Bar dataKey="arrows" fill="url(#barGradient)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>
          <TabsContent value="monthly">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlyData}>
                <XAxis dataKey="week" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip {...tooltipProps} />
                <Bar dataKey="arrows" fill="url(#barGradient)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>
          <TabsContent value="trend">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={dailyTrend}>
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis hide />
                <Tooltip {...tooltipProps} />
                <Area type="monotone" dataKey="arrows" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#areaGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>
          <TabsContent value="distance">
            {distanceData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">Add distances to your sessions to see distribution.</p>
            ) : (
              <div className="flex items-center gap-2">
                <ResponsiveContainer width="55%" height={180}>
                  <PieChart>
                    <Pie data={distanceData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={62} paddingAngle={2} strokeWidth={0}>
                      {distanceData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={(v: number) => [`${formatNumber(v)} arrows`, '']} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex-1 space-y-1.5">
                  {distanceData.map((d, i) => (
                    <li key={d.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="flex-1">{d.name}</span>
                      <span className="text-muted-foreground">{Math.round((d.value / distanceData.reduce((s, x) => s + x.value, 0)) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      <Card className="p-4 rounded-2xl">
        <h3 className="text-sm font-medium flex items-center gap-1.5 mb-3">
          <CalendarDays className="w-4 h-4 text-primary" /> Activity (12 weeks)
        </h3>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {heatmap.weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map(day => (
                <div
                  key={day.date}
                  title={`${new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${formatNumber(day.count)} arrows`}
                  className={`w-3 h-3 rounded-[3px] ${heatColor(day.count)}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-muted-foreground">
          <span>Less</span>
          <span className="w-2.5 h-2.5 rounded-[3px] bg-muted" />
          <span className="w-2.5 h-2.5 rounded-[3px] bg-primary/30" />
          <span className="w-2.5 h-2.5 rounded-[3px] bg-primary/50" />
          <span className="w-2.5 h-2.5 rounded-[3px] bg-primary/70" />
          <span className="w-2.5 h-2.5 rounded-[3px] bg-primary" />
          <span>More</span>
        </div>
      </Card>

      {distanceData.length > 0 && (
        <Card className="p-4 rounded-2xl">
          <h3 className="text-sm font-medium flex items-center gap-1.5 mb-3">
            <MapPin className="w-4 h-4 text-primary" /> Arrows by Distance
          </h3>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={distanceData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={42} />
              <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={(v: number) => [`${formatNumber(v)} arrows`, '']} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {distanceData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-muted-foreground text-right mt-1">{formatNumber(totalArrows)} arrows tracked</p>
        </Card>
      )}
    </div>
  );
}
