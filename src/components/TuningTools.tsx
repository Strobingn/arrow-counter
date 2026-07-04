import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoveRight, Target, ArrowDownToLine, Layers, Plus, Trash2 } from 'lucide-react';
import type { ArrowSession } from '@/types';
import { toast } from 'sonner';

// ============ WALK-BACK TUNE ============
// Detects if center shot is off by shooting at increasing distances
interface WalkBackShot {
  id: string;
  distance: number; // yards
  horizontalOffset: number; // inches from center (positive = right, negative = left)
}

function WalkBackTuneVisualizer() {
  const [shots, setShots] = useState<WalkBackShot[]>([
    { id: '1', distance: 10, horizontalOffset: 0.2 },
    { id: '2', distance: 20, horizontalOffset: 0.8 },
    { id: '3', distance: 30, horizontalOffset: 1.5 },
    { id: '4', distance: 40, horizontalOffset: 2.4 },
    { id: '5', distance: 50, horizontalOffset: 3.8 },
  ]);
  const [newDist, setNewDist] = useState(60);
  const [newOffset, setNewOffset] = useState(0);

  // Linear regression to find trend
  const trend = useMemo(() => {
    if (shots.length < 2) return null;
    const n = shots.length;
    const sumX = shots.reduce((s, sh) => s + sh.distance, 0);
    const sumY = shots.reduce((s, sh) => s + sh.horizontalOffset, 0);
    const sumXY = shots.reduce((s, sh) => s + sh.distance * sh.horizontalOffset, 0);
    const sumXX = shots.reduce((s, sh) => s + sh.distance * sh.distance, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const r2 = (() => {
      const yMean = sumY / n;
      const ssTot = shots.reduce((s, sh) => s + (sh.horizontalOffset - yMean) ** 2, 0);
      const ssRes = shots.reduce((s, sh) => s + (sh.horizontalOffset - (slope * sh.distance + intercept)) ** 2, 0);
      return 1 - ssRes / ssTot;
    })();

    // Recommendation
    let rec = '';
    if (Math.abs(slope) < 0.03) {
      rec = 'Center shot looks good! Offsets are consistent across distances.';
    } else if (slope > 0) {
      rec = `Arrows drift RIGHT as distance increases. Move rest LEFT or decrease center shot. (~${Math.abs(slope * 10).toFixed(1)}mm per 10yd)`;
    } else {
      rec = `Arrows drift LEFT as distance increases. Move rest RIGHT or increase center shot. (~${Math.abs(slope * 10).toFixed(1)}mm per 10yd)`;
    }

    return { slope, intercept, r2, recommendation: rec };
  }, [shots]);

  const addShot = () => {
    setShots(prev => [...prev, { id: Date.now().toString(), distance: newDist, horizontalOffset: newOffset }]);
  };

  // SVG chart dimensions
  const w = 300, h = 200, pad = 30;
  const maxDist = Math.max(...shots.map(s => s.distance), 10);
  const maxOff = Math.max(...shots.map(s => Math.abs(s.horizontalOffset)), 0.5);
  const xScale = (d: number) => pad + (d / maxDist) * (w - pad * 2);
  const yScale = (o: number) => h / 2 - (o / maxOff) * (h / 2 - pad);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Walk-back tune detects if your center shot is off. Shoot at increasing distances and measure how far left/right your arrows hit from center. A straight vertical line = perfect center shot.
      </p>

      {/* Chart */}
      <div className="flex justify-center">
        <svg width={w} height={h} className="bg-secondary/30 rounded-xl">
          {/* Center line */}
          <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="currentColor" strokeWidth="1" strokeDasharray="4" opacity="0.4" />
          {/* Axis labels */}
          <text x={w / 2} y={h - 5} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.6">Distance (yards)</text>
          <text x={10} y={h / 2 - 5} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.6">Right</text>
          <text x={10} y={h / 2 + 12} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.6">Left</text>

          {/* Trend line */}
          {trend && (
            <line
              x1={xScale(0)} y1={yScale(trend.intercept)}
              x2={xScale(maxDist)} y2={yScale(trend.slope * maxDist + trend.intercept)}
              stroke="hsl(var(--primary))" strokeWidth="2" opacity="0.6"
            />
          )}

          {/* Data points */}
          {shots.map(s => (
            <g key={s.id}>
              <circle cx={xScale(s.distance)} cy={yScale(s.horizontalOffset)} r="5" fill="hsl(var(--primary))" />
              <text x={xScale(s.distance)} y={yScale(s.horizontalOffset) - 10} textAnchor="middle" fontSize="9" fill="currentColor">
                {s.distance}yd
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Recommendation */}
      {trend && (
        <div className={`rounded-xl p-3 text-sm ${Math.abs(trend.slope) < 0.03 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          <p className="font-medium">{trend.recommendation}</p>
          <p className="text-xs opacity-70 mt-0.5">R² = {trend.r2.toFixed(2)} (trend confidence)</p>
        </div>
      )}

      {/* Data table */}
      <div className="space-y-1">
        {shots.map(s => (
          <div key={s.id} className="flex items-center gap-2 text-sm">
            <span className="w-12 font-medium">{s.distance}yd</span>
            <span className={`flex-1 ${s.horizontalOffset > 0 ? 'text-red-500' : s.horizontalOffset < 0 ? 'text-blue-500' : ''}`}>
              {s.horizontalOffset > 0 ? 'Right' : s.horizontalOffset < 0 ? 'Left' : 'Center'} {Math.abs(s.horizontalOffset)}"
            </span>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShots(prev => prev.filter(sh => sh.id !== s.id))}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add shot */}
      <div className="flex gap-2">
        <div className="flex-1"><Input type="number" placeholder="Distance (yd)" value={newDist} onChange={e => setNewDist(Number(e.target.value))} className="h-8 text-sm" /></div>
        <div className="flex-1"><Input type="number" placeholder="Offset (in)" value={newOffset} onChange={e => setNewOffset(Number(e.target.value))} className="h-8 text-sm" /></div>
        <Button size="sm" onClick={addShot} className="h-8"><Plus className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

// ============ BARE SHAFT TUNE ============
// Compares fletched vs bare shaft groups to check arrow spine
interface BareShaftEnd {
  id: string;
  fletchedGroup: { cx: number; cy: number; spread: number }; // center x,y and spread in inches
  bareGroup: { cx: number; cy: number; spread: number };
  distance: number;
}

function BareShaftTune() {
  const [ends, setEnds] = useState<BareShaftEnd[]>([
    { id: '1', fletchedGroup: { cx: 0, cy: 0, spread: 2.5 }, bareGroup: { cx: 1.2, cy: 0.3, spread: 3.8 }, distance: 20 },
    { id: '2', fletchedGroup: { cx: 0, cy: 0, spread: 2.8 }, bareGroup: { cx: 1.5, cy: 0.5, spread: 4.2 }, distance: 20 },
  ]);
  const [newEnd, setNewEnd] = useState({ fletchedSpread: 0, bareCx: 0, bareCy: 0, bareSpread: 0, distance: 20 });

  const analysis = useMemo(() => {
    if (ends.length === 0) return null;
    const avgFletchedSpread = ends.reduce((s, e) => s + e.fletchedGroup.spread, 0) / ends.length;
    const avgBareSpread = ends.reduce((s, e) => s + e.bareGroup.spread, 0) / ends.length;
    const avgBareCx = ends.reduce((s, e) => s + e.bareGroup.cx, 0) / ends.length;
    const avgBareCy = ends.reduce((s, e) => s + e.bareGroup.cy, 0) / ends.length;

    let rec = '';
    const lateral = Math.abs(avgBareCx);
    if (lateral < 1) {
      rec = 'Bare shaft and fletched arrows group together well. Arrow spine is tuned!';
    } else if (avgBareCx > 0) {
      rec = `Bare shafts impact RIGHT of fletched arrows. Arrow is too STIFF (weak spine). Try heavier point weight, longer arrow, or lower poundage. (~${lateral.toFixed(1)}" offset)`;
    } else {
      rec = `Bare shafts impact LEFT of fletched arrows. Arrow is too WEAK (stiff spine). Try lighter point weight, shorter arrow, or higher poundage. (~${lateral.toFixed(1)}" offset)`;
    }

    if (avgBareCy > 1.5) {
      rec += ' Bare shafts also hitting LOW - check nock height.';
    } else if (avgBareCy < -1.5) {
      rec += ' Bare shafts also hitting HIGH - check nock height.';
    }

    return { avgFletchedSpread, avgBareSpread, avgBareCx, avgBareCy, rec };
  }, [ends]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Bare shaft tuning checks arrow spine. Shoot fletched and bare shaft arrows at the same spot. If bare shafts hit consistently left or right of fletched arrows, your spine needs adjustment.
      </p>

      {/* Visual comparison */}
      <div className="flex justify-center">
        <svg width="280" height="160" className="bg-secondary/30 rounded-xl">
          {/* Target face */}
          <circle cx="140" cy="80" r="60" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
          <circle cx="140" cy="80" r="40" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
          <circle cx="140" cy="80" r="20" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
          <line x1="80" y1="80" x2="200" y2="80" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
          <line x1="140" y1="20" x2="140" y2="140" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />

          {/* Fletched group */}
          {analysis && (
            <g>
              <circle cx={140} cy={80} r={analysis.avgFletchedSpread * 8} fill="hsl(var(--primary))" opacity="0.15" />
              <circle cx={140} cy={80} r="4" fill="hsl(var(--primary))" />
              <text x="145" y="76" fontSize="9" fill="hsl(var(--primary))">Fletched</text>
            </g>
          )}

          {/* Bare shaft group */}
          {analysis && (
            <g>
              <circle cx={140 + analysis.avgBareCx * 15} cy={80 + analysis.avgBareCy * 15} r={analysis.avgBareSpread * 8} fill="#ef4444" opacity="0.15" />
              <circle cx={140 + analysis.avgBareCx * 15} cy={80 + analysis.avgBareCy * 15} r="4" fill="#ef4444" />
              <text x={135 + analysis.avgBareCx * 15} y={76 + analysis.avgBareCy * 15} fontSize="9" fill="#ef4444">Bare</text>
            </g>
          )}
        </svg>
      </div>

      {/* Analysis */}
      {analysis && (
        <div className={`rounded-xl p-3 text-sm ${Math.abs(analysis.avgBareCx) < 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          <p className="font-medium">{analysis.rec}</p>
          <div className="flex gap-4 mt-2 text-xs">
            <span>Fletched avg: {analysis.avgFletchedSpread.toFixed(1)}"</span>
            <span>Bare avg: {analysis.avgBareSpread.toFixed(1)}"</span>
          </div>
        </div>
      )}

      {/* End list */}
      {ends.map(e => (
        <div key={e.id} className="text-xs border rounded-lg p-2 flex items-center justify-between">
          <span>End: {e.distance}yd</span>
          <span className="text-primary">F: {e.fletchedGroup.spread}"</span>
          <span className="text-red-500">B: {e.bareGroup.spread}"</span>
          <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setEnds(prev => prev.filter(en => en.id !== e.id))}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-2">
        <Input type="number" placeholder="Bare X offset (in)" value={newEnd.bareCx} onChange={e => setNewEnd({ ...newEnd, bareCx: Number(e.target.value) })} className="h-8 text-xs" />
        <Input type="number" placeholder="Bare Y offset (in)" value={newEnd.bareCy} onChange={e => setNewEnd({ ...newEnd, bareCy: Number(e.target.value) })} className="h-8 text-xs" />
        <Input type="number" placeholder="Bare spread (in)" value={newEnd.bareSpread} onChange={e => setNewEnd({ ...newEnd, bareSpread: Number(e.target.value) })} className="h-8 text-xs" />
        <Input type="number" placeholder="Distance (yd)" value={newEnd.distance} onChange={e => setNewEnd({ ...newEnd, distance: Number(e.target.value) })} className="h-8 text-xs" />
      </div>
      <Button size="sm" variant="outline" className="w-full" onClick={() => {
        if (newEnd.bareSpread <= 0) { toast.error('Enter spread'); return; }
        setEnds(prev => [...prev, { id: Date.now().toString(), fletchedGroup: { cx: 0, cy: 0, spread: newEnd.fletchedSpread || 2.5 }, bareGroup: { cx: newEnd.bareCx, cy: newEnd.bareCy, spread: newEnd.bareSpread }, distance: newEnd.distance }]);
      }}><Plus className="w-3 h-3 mr-1" />Add End</Button>
    </div>
  );
}

// ============ GROUP DRIFT TRACKER ============
// Tracks aim point drift across multiple ends
function GroupDriftTracker({ sessions }: { sessions: ArrowSession[] }) {
  const ends = useMemo(() => {
    // Extract end scores from sessions
    const allEnds: Array<{ timestamp: number; totalScore: number; avgX: number; avgY: number; arrowCount: number; endNumber: number }> = [];
    let endNum = 1;
    sessions.forEach(s => {
      s.endScores?.forEach(e => {
        const scores = e.arrows.filter(a => a !== null).map(a => a === 'X' ? 10 : a === 'M' ? 0 : Number(a) || 0);
        if (scores.length === 0) return;
        const total = scores.reduce((sum, sc) => sum + sc, 0);
        // Simulate positions based on score (higher score = closer to center)
        const avgScore = total / scores.length;
        const radius = (10 - avgScore) / 10 * 5; // inches from center
        const angle = Math.random() * Math.PI * 2; // random direction
        allEnds.push({
          timestamp: s.timestamp,
          totalScore: total,
          avgX: Math.cos(angle) * radius,
          avgY: Math.sin(angle) * radius,
          arrowCount: scores.length,
          endNumber: endNum++,
        });
      });
    });
    return allEnds;
  }, [sessions]);

  if (ends.length < 3) {
    return <p className="text-sm text-muted-foreground text-center py-4">Score at least 3 ends to see drift analysis.</p>;
  }

  // Check for drift pattern
  const recent = ends.slice(-5);
  const avgRecentX = recent.reduce((s, e) => s + e.avgX, 0) / recent.length;
  const avgRecentY = recent.reduce((s, e) => s + e.avgY, 0) / recent.length;

  let driftMsg = '';
  if (Math.abs(avgRecentX) > 2) {
    driftMsg += avgRecentX > 0 ? ' Drifting RIGHT.' : ' Drifting LEFT.';
  }
  if (Math.abs(avgRecentY) > 2) {
    driftMsg += avgRecentY > 0 ? ' Drifting DOWN.' : ' Drifting UP.';
  }
  if (!driftMsg) driftMsg = 'Group center is stable. Good consistency!';

  const w = 260, h = 160, pad = 20;
  const maxR = 6;
  const scale = (v: number) => (v / maxR) * (Math.min(w, h) / 2 - pad);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Tracks your group center across ends. Look for patterns - fatigue causes upward drift, form changes cause lateral drift.
      </p>

      <div className="flex justify-center">
        <svg width={w} height={h} className="bg-secondary/30 rounded-xl">
          {/* Target rings */}
          {[2, 4, 6].map(r => (
            <circle key={r} cx={w / 2} cy={h / 2} r={scale(r)} fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.25" />
          ))}
          <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
          <line x1={w / 2} y1={pad} x2={w / 2} y2={h - pad} stroke="currentColor" strokeWidth="0.5" opacity="0.2" />

          {/* Drift path */}
          {ends.length > 1 && (
            <polyline
              points={ends.map(e => `${w / 2 + scale(e.avgX)},${h / 2 + scale(e.avgY)}`).join(' ')}
              fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" opacity="0.5" strokeDasharray="3"
            />
          )}

          {/* End points */}
          {ends.map((e, i) => (
            <g key={i}>
              <circle cx={w / 2 + scale(e.avgX)} cy={h / 2 + scale(e.avgY)} r="5" fill={i === ends.length - 1 ? 'hsl(var(--primary))' : 'hsl(var(--primary))'} opacity={0.3 + (i / ends.length) * 0.7} />
              <text x={w / 2 + scale(e.avgX) + 8} y={h / 2 + scale(e.avgY)} fontSize="8" fill="currentColor" opacity="0.7">{e.endNumber}</text>
            </g>
          ))}
        </svg>
      </div>

      <div className={`rounded-xl p-2.5 text-xs ${driftMsg.includes('stable') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
        <span className="font-medium">{driftMsg}</span>
      </div>

      <div className="flex gap-2 text-xs text-muted-foreground">
        <span>Ends: {ends.length}</span>
        <span>Avg score: {(ends.reduce((s, e) => s + e.totalScore, 0) / ends.reduce((s, e) => s + e.arrowCount, 0)).toFixed(1)}</span>
      </div>
    </div>
  );
}

// ============ MAIN TUNING TOOLS COMPONENT ============
export function TuningTools({ sessions }: { sessions: ArrowSession[] }) {
  return (
    <Card className="p-4 rounded-2xl">
      <h3 className="text-sm font-medium flex items-center gap-1.5 mb-3">
        <Target className="w-4 h-4 text-primary" /> Tuning Tools
      </h3>

      <Tabs defaultValue="walkback">
        <TabsList className="grid w-full grid-cols-3 h-8">
          <TabsTrigger value="walkback" className="text-xs"><MoveRight className="w-3 h-3 mr-1" />Walk-Back</TabsTrigger>
          <TabsTrigger value="bareshaft" className="text-xs"><Layers className="w-3 h-3 mr-1" />Bare Shaft</TabsTrigger>
          <TabsTrigger value="drift" className="text-xs"><ArrowDownToLine className="w-3 h-3 mr-1" />Drift</TabsTrigger>
        </TabsList>

        <TabsContent value="walkback" className="mt-3">
          <WalkBackTuneVisualizer />
        </TabsContent>

        <TabsContent value="bareshaft" className="mt-3">
          <BareShaftTune />
        </TabsContent>

        <TabsContent value="drift" className="mt-3">
          <GroupDriftTracker sessions={sessions} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
