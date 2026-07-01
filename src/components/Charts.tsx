import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, BarChart3 } from 'lucide-react';
import type { ArrowSession } from '@/types';

interface ChartsProps {
  sessions: ArrowSession[];
  formatNumber: (num: number) => string;
}

export function Charts({ sessions, formatNumber }: ChartsProps) {
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

  if (sessions.length === 0) {
    return (
      <Card className="p-4 rounded-2xl">
        <p className="text-sm text-muted-foreground text-center py-4">Shoot some arrows to see charts!</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 rounded-2xl">
      <Tabs defaultValue="weekly">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-primary" /> Trends
          </h3>
          <TabsList className="h-7">
            <TabsTrigger value="weekly" className="text-xs px-2 py-0.5"><BarChart3 className="w-3 h-3 mr-1" />7-Day</TabsTrigger>
            <TabsTrigger value="monthly" className="text-xs px-2 py-0.5">4-Wk</TabsTrigger>
            <TabsTrigger value="trend" className="text-xs px-2 py-0.5">Line</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="weekly">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v: number) => [`${formatNumber(v)} arrows`, 'Count']} contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
              <Bar dataKey="arrows" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </TabsContent>

        <TabsContent value="monthly">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyData}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v: number) => [`${formatNumber(v)} arrows`, 'Count']} contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
              <Bar dataKey="arrows" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </TabsContent>

        <TabsContent value="trend">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={dailyTrend}>
              <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis hide />
              <Tooltip formatter={(v: number) => [`${formatNumber(v)} arrows`, 'Count']} contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
              <Line type="monotone" dataKey="arrows" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
