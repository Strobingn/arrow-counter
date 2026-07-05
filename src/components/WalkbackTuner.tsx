"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { 
  Target, TrendingUp, Zap, AlertTriangle, CheckCircle, ArrowRight, Download 
} from 'lucide-react';
import { 
  WalkbackPoint, TuneDiagnosis, simulateTuneAdjustment, diagnoseWalkbackPattern, 
  calculateWalkbackDrift, calculateTuneQualityIndex, compareBareFletched 
} from '@/utils/tuningAnalysis';
import { GroupStats } from '@/types/archery';

// Full badass Walk-Back Tuning Visualizer
// Drop this into TuningTools or a new tab
// Reuses your canvas patterns + GroupStats from AutoGroupMLAnalyzer

interface WalkbackTunerProps {
  onSaveWalkback?: (points: WalkbackPoint[]) => void;
  initialPoints?: WalkbackPoint[];
  currentGroupStats?: GroupStats; // from photo analyzer
}

export const WalkbackTuner: React.FC<WalkbackTunerProps> = ({
  onSaveWalkback,
  initialPoints = [],
  currentGroupStats,
}) => {
  const [points, setPoints] = useState<WalkbackPoint[]>(initialPoints);
  const [selectedDistance, setSelectedDistance] = useState(20);
  const [newVertical, setNewVertical] = useState(0);
  const [newHorizontal, setNewHorizontal] = useState(0);
  const [diagnoses, setDiagnoses] = useState<TuneDiagnosis[]>([]);
  const [qualityIndex, setQualityIndex] = useState(70);
  const [showSimulation, setShowSimulation] = useState(false);

  // Tune adjustment sliders (what-if mode)
  const [nockHeight, setNockHeight] = useState(0);
  const [plungerTension, setPlungerTension] = useState(0);
  const [tiller, setTiller] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Add current group from photo analyzer as a walk-back point
  const addCurrentGroup = () => {
    if (!currentGroupStats) return;
    const newPoint: WalkbackPoint = {
      distanceYards: selectedDistance,
      verticalInches: currentGroupStats.centerRealWorld?.yInches || 0,
      horizontalInches: currentGroupStats.centerRealWorld?.xInches || 0,
      groupStats: currentGroupStats,
    };
    const updated = [...points.filter(p => p.distanceYards !== selectedDistance), newPoint]
      .sort((a, b) => a.distanceYards - b.distanceYards);
    setPoints(updated);
    runDiagnosis(updated);
  };

  const runDiagnosis = (pts: WalkbackPoint[]) => {
    const diags = diagnoseWalkbackPattern(pts);
    setDiagnoses(diags);
    const q = calculateTuneQualityIndex(pts);
    setQualityIndex(q);
  };

  // Draw the walk-back chart
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width = 700;
    const h = canvas.height = 420;
    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let x = 50; x < w; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 30);
      ctx.lineTo(x, h - 40);
      ctx.stroke();
    }
    for (let y = 30; y < h - 40; y += 50) {
      ctx.beginPath();
      ctx.moveTo(50, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, h - 40);
    ctx.lineTo(w - 20, h - 40); // X
    ctx.moveTo(50, 30);
    ctx.lineTo(50, h - 40);     // Y
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px sans-serif';
    ctx.fillText('Distance (yd)', w / 2 - 30, h - 10);
    ctx.save();
    ctx.translate(15, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Vertical Impact (inches from expected)', -120, 0);
    ctx.restore();

    if (points.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '16px sans-serif';
      ctx.fillText('Add walk-back points (use photo analyzer or manual entry)', 120, h / 2);
      return;
    }

    // Scale
    const maxDist = Math.max(...points.map(p => p.distanceYards), 50);
    const maxVert = Math.max(...points.map(p => Math.abs(p.verticalInches)), 8);
    const xScale = (w - 80) / maxDist;
    const yScale = (h - 80) / (maxVert * 2);
    const yZero = h / 2 + 10;

    // Draw ideal straight line (zero drift)
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(50, yZero);
    ctx.lineTo(w - 20, yZero);
    ctx.stroke();
    ctx.setLineDash([]);

    // Plot points + error bars
    points.forEach((p, i) => {
      const x = 50 + p.distanceYards * xScale;
      const y = yZero - p.verticalInches * yScale;

      // Error bar (group size / std)
      const err = (p.groupStats.stdDevRadius || 1) * yScale * 0.6;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - err);
      ctx.lineTo(x, y + err);
      ctx.stroke();

      // Point
      ctx.fillStyle = i === points.length - 1 ? '#3b82f6' : '#a855f7';
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${p.distanceYards}yd`, x - 12, yZero + 18);
      ctx.fillText(`${p.verticalInches.toFixed(1)}"`, x + 12, y - 12);
    });

    // Best fit line
    if (points.length > 1) {
      const drift = calculateWalkbackDrift(points);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const first = points[0];
      const last = points[points.length - 1];
      const x1 = 50 + first.distanceYards * xScale;
      const y1 = yZero - first.verticalInches * yScale;
      const x2 = 50 + last.distanceYards * xScale;
      const y2 = yZero - (first.verticalInches + drift.verticalDriftPer10yd * (last.distanceYards - first.distanceYards) / 10) * yScale;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Simulation overlay if active
    if (showSimulation && points.length > 0) {
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      points.forEach(p => {
        const sim = simulateTuneAdjustment(p, { nockHeight, plungerTension, tiller });
        const x = 50 + p.distanceYards * xScale;
        const y = yZero - sim.newVerticalInches * yScale;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }
  }, [points, showSimulation, nockHeight, plungerTension, tiller]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const handleSimulate = () => {
    setShowSimulation(!showSimulation);
    if (!showSimulation) runDiagnosis(points);
  };

  const saveWalkback = () => {
    onSaveWalkback?.(points);
    alert('Walk-back session saved to history. ML trend updated.');
  };

  const clearAll = () => {
    setPoints([]);
    setDiagnoses([]);
    setQualityIndex(70);
    setShowSimulation(false);
  };

  return (
    <div className="space-y-6 p-4 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <Target className="h-8 w-8 text-primary" /> WALK-BACK TUNER v2
          </h2>
          <p className="text-muted-foreground">Deep walk-back analysis • Auto diagnosis • What-if simulation • Group shift tracking</p>
        </div>
        <Badge variant={qualityIndex > 80 ? "default" : qualityIndex > 60 ? "secondary" : "destructive"} className="text-lg px-4">
          TUNE QUALITY: {qualityIndex}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2"><Zap /> ADD DATA</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Distance (yd)</Label>
              <div className="flex gap-2 mt-1">
                {[10,15,20,25,30,40,50].map(d => (
                  <Button key={d} variant={selectedDistance === d ? "default" : "outline"} size="sm" onClick={() => setSelectedDistance(d)}>{d}</Button>
                ))}
              </div>
            </div>

            <Button onClick={addCurrentGroup} disabled={!currentGroupStats} className="w-full gap-2" size="lg">
              <Target className="h-4 w-4" /> ADD CURRENT GROUP FROM PHOTO ANALYZER
            </Button>
            <p className="text-xs text-muted-foreground">Uses the latest group from AutoGroupMLAnalyzer (center + real-world inches)</p>

            <div className="pt-4 border-t">
              <Label>Manual Entry (inches from expected line)</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Input type="number" placeholder="Vertical" value={newVertical} onChange={e => setNewVertical(parseFloat(e.target.value) || 0)} />
                <Input type="number" placeholder="Horizontal" value={newHorizontal} onChange={e => setNewHorizontal(parseFloat(e.target.value) || 0)} />
              </div>
              <Button 
                onClick={() => {
                  const np: WalkbackPoint = { distanceYards: selectedDistance, verticalInches: newVertical, horizontalInches: newHorizontal, groupStats: { arrowCount: 6, center: {x:0,y:0}, maxRadiusInches: 2, meanRadiusInches: 1.2, stdDevRadius: 0.8, diameterMOA: 2.1, groupSize95PercentInches: 2.5, windageBiasInches: newHorizontal, elevationBiasInches: newVertical, outliers: [], qualityScore: 75 } as any };
                  const up = [...points.filter(p => p.distanceYards !== selectedDistance), np].sort((a,b)=>a.distanceYards-b.distanceYards);
                  setPoints(up);
                  runDiagnosis(up);
                  setNewVertical(0); setNewHorizontal(0);
                }} 
                className="w-full mt-2" variant="secondary"
              >
                Add Manual Point
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Canvas */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Walk-Back Chart</CardTitle>
            <div className="flex gap-2">
              <Button onClick={handleSimulate} variant={showSimulation ? "default" : "outline"} size="sm" className="gap-1">
                {showSimulation ? "Hide" : "Show"} What-If Simulation
              </Button>
              <Button onClick={clearAll} variant="destructive" size="sm">Clear</Button>
            </div>
          </CardHeader>
          <CardContent>
            <canvas ref={canvasRef} className="w-full border rounded bg-slate-950" />
            <div className="text-xs text-muted-foreground mt-2 flex justify-between">
              <span>Green dashed = ideal zero drift line</span>
              <span>Red line = actual best-fit drift</span>
              {showSimulation && <span className="text-cyan-400">Cyan dots = simulated after tune change</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tune Adjustment Sliders (What-If) */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp /> WHAT-IF TUNE ADJUSTMENTS (live simulation)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <Label>Nock Height Adjustment (inches)</Label>
              <Slider value={[nockHeight]} onValueChange={v => setNockHeight(v[0])} min={-0.25} max={0.25} step={0.0625} className="mt-2" />
              <div className="text-right font-mono text-sm mt-1">{nockHeight.toFixed(3)}"</div>
            </div>
            <div>
              <Label>Plunger Tension (turns)</Label>
              <Slider value={[plungerTension]} onValueChange={v => setPlungerTension(v[0])} min={-1} max={1} step={0.25} className="mt-2" />
              <div className="text-right font-mono text-sm mt-1">{plungerTension.toFixed(2)}</div>
            </div>
            <div>
              <Label>Tiller Adjustment (mm)</Label>
              <Slider value={[tiller]} onValueChange={v => setTiller(v[0])} min={-1} max={1} step={0.1} className="mt-2" />
              <div className="text-right font-mono text-sm mt-1">{tiller.toFixed(1)} mm</div>
            </div>
          </div>
          <Button onClick={handleSimulate} className="mt-4 w-full" size="lg">
            {showSimulation ? "Update Simulation" : "Run Live What-If Simulation"}
          </Button>
        </CardContent>
      </Card>

      {/* Diagnosis + Bare vs Fletched */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle /> AUTO DIAGNOSIS</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {diagnoses.length > 0 ? diagnoses.map((d, i) => (
              <div key={i} className="p-3 border rounded-lg bg-muted/30">
                <div className="font-semibold flex items-center gap-2">
                  {d.confidence > 0.75 ? <CheckCircle className="text-green-500" /> : <AlertTriangle className="text-yellow-500" />}
                  {d.issue}
                </div>
                <div className="text-sm mt-1 text-muted-foreground">{d.fix}</div>
                <div className="text-xs mt-1">Confidence: {(d.confidence * 100).toFixed(0)}% • Affects: {d.affectedMetric}</div>
              </div>
            )) : <p className="text-muted-foreground">Add 3+ walk-back points to get automatic tune diagnosis.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Bare vs Fletched Comparison</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Run separate walk-backs for bare shafts and fletched arrows, then compare here (future: auto from two sessions).</p>
            <Button variant="outline" className="w-full" onClick={() => alert('Load bare and fletched walk-back sessions to see delta + spine recommendation')}>Compare Bare vs Fletched (coming in next commit)</Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button onClick={saveWalkback} disabled={points.length === 0} size="lg" className="gap-2">
          <Download /> SAVE WALK-BACK SESSION TO HISTORY
        </Button>
        <Button onClick={() => runDiagnosis(points)} variant="secondary" size="lg">Re-run Diagnosis</Button>
      </div>

      <div className="text-xs text-muted-foreground max-w-prose">
        Pro tip: The more points you add (especially from real photo groups), the smarter the diagnosis and ML predictions become. This directly feeds your trend model and personal ballistic twin.
      </div>
    </div>
  );
};

export default WalkbackTuner;