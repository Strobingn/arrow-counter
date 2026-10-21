import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, ArrowUpRight, BarChart3, CalendarDays, Crosshair, Ruler, Target, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line,
  CartesianGrid, ReferenceLine, PieChart, Pie, Cell,
} from 'recharts';
import type { ArrowSession, BowProfile } from '@/types';
import { buildAnalytics, type AnalyticsPeriod } from '@/lib/analytics';
import { dayLabel } from '@/lib/dates';
import { useLocalDay } from '@/hooks/useLocalDay';

const INK = '#eeeeee';
const MUTED = '#a1a1a1';
const TONES = ['#eeeeee', '#b8b8b8', '#8a8a8a', '#5c5c5c', '#454545'];
const tooltipStyle = { background: '#242424', border: '1px solid #454545', borderRadius: 12, color: INK, fontSize: 12 };
const tick = { fill: MUTED, fontSize: 11 };
const integer = (value: number) => value.toLocaleString();

export function ChartPanel({ title, subtitle, icon, children, className = '', detail }: {
  title: string; subtitle: string; icon: ReactNode; children: ReactNode; className?: string; detail?: ReactNode;
}) {
  return <section className={`chart-panel ${className}`}>
    <div className="panel-heading">
      <div className="flex min-w-0 items-start gap-3">
        <span className="panel-icon" aria-hidden="true">{icon}</span>
        <div className="min-w-0"><h3>{title}</h3><p>{subtitle}</p></div>
      </div>
      {detail}
    </div>
    {children}
  </section>;
}

function EmptyChart({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-chart">
    <div className="empty-target" aria-hidden="true"><Target size={32} strokeWidth={1} /></div>
    <strong>{title}</strong><p>{children}</p>
  </div>;
}

interface ChartsProps {
  sessions: ArrowSession[];
  bowProfiles: BowProfile[];
  goal: number;
  formatNumber: (num: number) => string;
  compact?: boolean;
}

export function Charts({ sessions, bowProfiles, goal, formatNumber, compact = false }: ChartsProps) {
  const [period, setPeriod] = useState<AnalyticsPeriod>(30);
  const [selectedBow, setSelectedBow] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = useLocalDay();
  const days = compact ? 7 : period;
  const bowId = compact ? '' : selectedBow;
  const gradientId = useId().replace(/:/g, '');
  const data = useMemo(() => buildAnalytics(sessions, { days, today, goal, bowId }), [sessions, days, today, goal, bowId]);
  const bowName = (id: string) => bowProfiles.find(bow => bow.id === id)?.name || (id === 'unassigned' ? 'No bow recorded' : 'Previous bow');
  const bowChoices = [...new Set([...bowProfiles.map(bow => bow.id), ...sessions.map(session => session.bowId || 'unassigned')])];
  const bowData = data.bows.map(bow => ({ ...bow, name: bowName(bow.id) }));
  const peak = Math.max(1, ...data.daily.map(day => day.arrows));
  const selectedDay = data.daily.find(day => day.date === selectedDate) || data.daily[data.daily.length - 1];
  const change = data.changePercent;
  const compared = change === null ? 'No arrows in previous period' : `${change > 0 ? '+' : ''}${change.toFixed(0)}% vs previous ${days} days`;

  return <div className="space-y-5">
    {!compact && <>
      <div className="analytics-controls">
        <div className="segmented-control" role="group" aria-label="Chart date range">
          {([7, 30, 90] as const).map(value => <button key={value} onClick={() => setPeriod(value)} aria-pressed={period === value}>{value} days</button>)}
        </div>
        <label className="bow-filter"><Crosshair size={16} aria-hidden="true" /><span className="sr-only">Filter charts by bow</span>
          <select aria-label="Filter charts by bow" value={selectedBow} onChange={event => setSelectedBow(event.target.value)}>
            <option value="">All bows</option>
            {bowChoices.map(id => <option key={id} value={id}>{bowName(id)}</option>)}
          </select>
        </label>
      </div>
      <div className="metric-strip" aria-live="polite">
        <div><span>Arrows logged</span><strong>{formatNumber(data.total)}</strong><small>{compared}</small></div>
        <div><span>Practice days</span><strong>{data.activeDays}<em> / {days}</em></strong><small>{data.filtered.length} logged sessions</small></div>
        <div><span>Score / arrow</span><strong>{data.average === null ? '—' : data.average.toFixed(2)}<em> / 10</em></strong><small>{formatNumber(data.scored)} scored arrows</small></div>
        <div><span>X-ring rate</span><strong>{data.xRate === null ? '—' : `${data.xRate.toFixed(1)}%`}</strong><small>Of scored arrows</small></div>
      </div>
    </>}

    <div className={`chart-grid ${compact ? 'chart-grid-overview' : ''}`}>
      <ChartPanel title="Arrow volume" subtitle={`${dayLabel(data.daily[0].date)} – ${dayLabel(today)} · arrows per day`} icon={<BarChart3 size={18} />}
        className={compact ? 'volume-panel' : ''} detail={<span className="chart-total">{formatNumber(data.total)}<small>arrows</small></span>}>
        {data.total > 0 ? <>
          <div className="chart-canvas" aria-label={`Daily arrow volume. ${data.total} arrows over ${days} days. Current daily goal ${goal}.`}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={data.daily} margin={{ top: 18, right: 8, left: -14, bottom: 0 }} accessibilityLayer>
                <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#eeeeee" /><stop offset="100%" stopColor="#737373" /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="#333333" strokeDasharray="3 5" />
                <XAxis dataKey="date" tick={tick} tickFormatter={date => dayLabel(date, days === 7 ? { weekday: 'short' } : { month: 'numeric', day: 'numeric' })} axisLine={false} tickLine={false} minTickGap={25} />
                <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} width={46} />
                <Tooltip cursor={{ fill: '#ffffff09' }} contentStyle={tooltipStyle} itemStyle={{ color: INK }} labelFormatter={date => dayLabel(String(date))} formatter={(value: number) => [formatNumber(value), 'Arrows']} />
                <ReferenceLine y={goal} stroke="#a1a1a1" strokeDasharray="4 4" ifOverflow="extendDomain" />
                <Bar dataKey="arrows" fill={`url(#${gradientId})`} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-foot"><span><i className="legend-dash" />Current goal: {goal}/day</span><span>{data.goalsMet} {data.goalsMet === 1 ? 'day' : 'days'} at goal</span></div>
        </> : <EmptyChart title="Your next arrow starts the chart">Log arrows in Shoot. Every practice day will appear here.</EmptyChart>}
      </ChartPanel>

      <ChartPanel title="Score trend" subtitle="Daily average · scored arrows only" icon={<TrendingUp size={18} />}
        detail={<span className="chart-total">{data.average === null ? '—' : data.average.toFixed(2)}<small>out of 10</small></span>}>
        {data.scored > 0 ? <>
          <div className="chart-canvas" aria-label={`Average score ${data.average?.toFixed(2)} out of 10 from ${data.scored} scored arrows.`}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={data.daily} margin={{ top: 18, right: 16, left: -18, bottom: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="#333333" strokeDasharray="3 5" />
                <XAxis dataKey="date" tick={tick} tickFormatter={date => dayLabel(date, { month: 'numeric', day: 'numeric' })} axisLine={false} tickLine={false} minTickGap={28} />
                <YAxis domain={[0, 10]} ticks={[0, 5, 10]} tick={tick} axisLine={false} tickLine={false} width={42} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: INK }} labelFormatter={date => dayLabel(String(date))} formatter={(value: number) => [value.toFixed(2), 'Average / 10']} />
                <Line type="linear" dataKey="average" stroke={INK} strokeWidth={2} dot={{ r: 3, fill: '#121212', strokeWidth: 2 }} activeDot={{ r: 5, fill: INK }} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-foot"><span>X = 10 · M = 0</span><span>Unscored days stay blank</span></div>
        </> : <EmptyChart title="Give every arrow a score">Open Scores in Shoot, save an end, then add the session.</EmptyChart>}
      </ChartPanel>

      <ChartPanel title="Practice rhythm" subtitle={`${days} days · tap a day to inspect`} icon={<CalendarDays size={18} />} className={compact ? 'rhythm-panel' : ''}>
        <div className="rhythm-summary"><strong>{data.activeDays}<small> / {days}</small></strong><span>days on the range</span></div>
        <div className={`activity-grid ${days === 7 ? 'activity-week' : ''}`}>
          {data.daily.map(day => {
            const level = day.arrows === 0 ? 0 : Math.max(1, Math.ceil(day.arrows / peak * 4));
            return <button key={day.date} className={`activity-day activity-level-${level}`} aria-pressed={selectedDay.date === day.date}
              aria-label={`${dayLabel(day.date, { month: 'long', day: 'numeric' })}: ${day.arrows} arrows`}
              title={`${dayLabel(day.date)} · ${day.arrows} arrows`} onClick={() => setSelectedDate(day.date)}>
              {days === 7 ? <><span>{dayLabel(day.date, { weekday: 'narrow' })}</span><strong>{day.arrows}</strong></> : <span>{Number(day.date.slice(-2))}</span>}
            </button>;
          })}
        </div>
        <div className="chart-foot" aria-live="polite"><span>{dayLabel(selectedDay.date)} · <strong>{selectedDay.arrows} arrows</strong></span><span>{selectedDay.sessions} {selectedDay.sessions === 1 ? 'session' : 'sessions'}</span></div>
        <div className="heat-legend"><span>Less</span>{[0, 1, 2, 3, 4].map(level => <i key={level} className={`activity-level-${level}`} />)}<span>More</span></div>
      </ChartPanel>

      {!compact && <>
        <ChartPanel title="Score distribution" subtitle="Where your scored arrows land" icon={<Target size={18} />}>
          {data.scored > 0 ? <>
            <div className="chart-canvas">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={data.distribution} margin={{ top: 15, right: 4, left: -14, bottom: 0 }} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke="#333333" strokeDasharray="3 5" />
                  <XAxis dataKey="score" tick={tick} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} width={42} />
                  <Tooltip cursor={{ fill: '#ffffff09' }} contentStyle={tooltipStyle} itemStyle={{ color: INK }} formatter={(value: number) => [integer(value), 'Arrows']} />
                  <Bar dataKey="arrows" radius={[4, 4, 0, 0]} isAnimationActive={false}>{data.distribution.map((item, index) => <Cell key={item.score} fill={index < 2 ? INK : '#8a8a8a'} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-foot"><span>{data.distribution[0].arrows} Xs · {data.distribution[1].arrows} tens</span><span>{data.distribution[11].arrows} misses</span></div>
            <details className="chart-data"><summary>Score values</summary><div className="score-values">{data.distribution.map(item => <span key={item.score}><b>{item.score}</b> {item.arrows}</span>)}</div></details>
          </> : <EmptyChart title="See your scoring pattern">Saved end scores will build this distribution. Blank scores are excluded.</EmptyChart>}
        </ChartPanel>

        <ChartPanel title="Distance breakdown" subtitle="Arrows at each recorded distance" icon={<Ruler size={18} />}>
          {data.distances.length ? <div className="breakdown-list">
            {data.distances.map(item => <div key={item.name} className="breakdown-item"><div><span>{item.name}</span><strong>{formatNumber(item.arrows)} <small>arrows</small></strong></div><div className="bar-track"><span style={{ width: `${item.arrows / Math.max(...data.distances.map(distance => distance.arrows)) * 100}%` }} /></div></div>)}
          </div> : <EmptyChart title="Find your practiced distances">Add a distance under Gear when logging a session.</EmptyChart>}
          <div className="chart-foot"><span>Yards and meters shown separately</span><span>{formatNumber(data.missingDistance)} without distance</span></div>
        </ChartPanel>

        <ChartPanel title="Bow usage" subtitle="Share of arrows in this period" icon={<Crosshair size={18} />}>
          {bowData.length ? <div className="bow-breakdown">
            <div className="donut-chart">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart><Pie data={bowData} dataKey="arrows" nameKey="name" innerRadius="68%" outerRadius="90%" stroke="#1a1a1a" strokeWidth={4} isAnimationActive={false}>
                  {bowData.map((bow, index) => <Cell key={bow.id} fill={TONES[index % TONES.length]} />)}
                </Pie><Tooltip contentStyle={tooltipStyle} itemStyle={{ color: INK }} formatter={(value: number) => [`${integer(value)} arrows`]} /></PieChart>
              </ResponsiveContainer>
              <div className="donut-label"><strong>{bowData.length}</strong><span>{bowData.length === 1 && bowData[0].id === 'unassigned' ? 'unassigned' : 'setups'}</span></div>
            </div>
            <div className="donut-legend">{bowData.map((bow, index) => <div key={bow.id}><i style={{ background: TONES[index % TONES.length] }} /><span>{bow.name}<small>{formatNumber(bow.arrows)} arrows</small></span><strong>{Math.round(bow.arrows / data.total * 100)}%</strong></div>)}</div>
          </div> : <EmptyChart title="Build a picture of your setups">Choose a bow when logging arrows to compare usage here.</EmptyChart>}
        </ChartPanel>

        <ChartPanel title="Group quality" subtitle="Your session ratings · not measured group size" icon={<Activity size={18} />}>
          {data.ratedSessions ? <div className="breakdown-list">
            {data.groups.map((group, index) => <div key={group.key} className="breakdown-item"><div><span className="capitalize">{group.key === 'scatter' ? 'Scattered' : group.key}</span><strong>{group.sessions} <small>sessions</small></strong></div><div className="bar-track"><span style={{ width: `${group.sessions / data.ratedSessions * 100}%`, background: TONES[index] }} /></div></div>)}
            <p className="text-xs text-muted-foreground">{data.filtered.length - data.ratedSessions} sessions without a rating.</p>
          </div> : <EmptyChart title="Track how your groups feel">Choose a grouping quality under Gear when you log a session.</EmptyChart>}
        </ChartPanel>
      </>}
    </div>

    {!compact && <details className="chart-panel data-table-panel">
      <summary><span><BarChart3 size={16} />Daily chart values</span><ArrowUpRight size={16} /></summary>
      <div className="overflow-x-auto"><table className="chart-table"><caption className="sr-only">Daily chart values for the selected dates and bow</caption><thead><tr><th>Date</th><th>Arrows</th><th>Sessions</th><th>Scored</th><th>Avg / 10</th></tr></thead><tbody>{data.daily.map(day => <tr key={day.date}><th scope="row">{dayLabel(day.date)}</th><td>{formatNumber(day.arrows)}</td><td>{day.sessions}</td><td>{day.scored}</td><td>{day.average === null ? '—' : day.average.toFixed(2)}</td></tr>)}</tbody></table></div>
    </details>}
  </div>;
}
