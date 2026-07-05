import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

// ============================================================
// 1. DYNAMIC SPINE CALCULATOR
// ============================================================
// AMO/ASTM spine deflection to actual dynamic spine at given setup

interface SpineInput {
  drawWeight: number; // lbs
  drawLength: number; // inches (AMO)
  arrowLength: number; // inches (carbon to carbon)
  pointWeight: number; // grains
  fletchWeight: number; // grains (total 3 vanes)
  nockWeight: number; // grains
  insertWeight: number; // grains
  bowType: 'compound' | 'recurve' | 'longbow';
  camType: 'soft' | 'hard' | 'hybrid' | 'single';
  iboSpeed: number; // fps
}

const DEFAULT_SPINE: SpineInput = {
  drawWeight: 60, drawLength: 28, arrowLength: 28.5,
  pointWeight: 100, fletchWeight: 24, nockWeight: 12, insertWeight: 16,
  bowType: 'compound', camType: 'hard', iboSpeed: 330,
};

export function DynamicSpineCalculator() {
  const [spec, setSpec] = useState<SpineInput>({ ...DEFAULT_SPINE });
  const [measuredDeflection, setMeasuredDeflection] = useState<number | ''>(''); // inches of deflection on spine tester

  const results = useMemo(() => {
    // Total arrow weight
    const shaftWeightEstimate = 5 * spec.arrowLength; // rough grains per inch for common carbons
    const totalWeight = shaftWeightEstimate + spec.pointWeight + spec.fletchWeight + spec.nockWeight + spec.insertWeight;

    // Dynamic spine formula (simplified but accurate enough for practical use)
    // Based on: http://www.archeryreport.com/2008/09/dynamic-spine-formula/
    const staticSpine = measuredDeflection !== '' ? 26 / (measuredDeflection as number) : 0;

    // Bow aggression factor (how hard the bow is on the arrow)
    const aggressionFactors: Record<string, number> = { compound: 1.0, recurve: 0.85, longbow: 0.75 };
    const camFactors: Record<string, number> = { soft: 0.9, hard: 1.1, hybrid: 1.0, single: 0.95 };
    const bowAggression = aggressionFactors[spec.bowType] * camFactors[spec.camType];

    // DL adjustment: every inch over 28 weakens effective spine by ~3.5%
    const dlFactor = 1 + (spec.drawLength - 28) * 0.035;

    // Point weight adjustment: every 25gr over 100 weakens by ~5%
    const pointFactor = 1 + (spec.pointWeight - 100) / 25 * 0.05;

    // Arrow length adjustment: every inch over 28 weakens by ~4%
    const lengthFactor = 1 + (spec.arrowLength - 28) * 0.04;

    // Draw weight to IBO ratio (how close to rated speed)
    const speedRatio = spec.iboSpeed / (spec.drawWeight + 40); // rough IBO at given DW
    const speedFactor = speedRatio > 5.5 ? 1.08 : speedRatio < 4.5 ? 0.92 : 1.0;

    const dynamicSpine = staticSpine * bowAggression * dlFactor * pointFactor * lengthFactor * speedFactor;

    // Recommended static spine for this setup
    const recommendedStatic = spec.drawWeight * bowAggression / (dlFactor * pointFactor * lengthFactor * speedFactor);

    // Recommended deflection
    const recommendedDeflection = 26 / recommendedStatic;

    // Convert to common spine rating (e.g., 340, 400, 500)
    const spineRating = dynamicSpine > 0 ? Math.round(1000 / dynamicSpine) * 10 : 0;
    const recommendedRating = Math.round(1000 / recommendedStatic) * 10;

    // Arrow weight / draw weight ratio (for hunting minimums)
    const gpp = totalWeight / spec.drawWeight; // grains per pound
    const ke = (spec.drawWeight * spec.iboSpeed * spec.iboSpeed) / 450240; // kinetic energy (ft-lbs)
    const momentum = (totalWeight * spec.iboSpeed) / 225120; // slug-ft/s

    return { totalWeight, staticSpine, dynamicSpine, recommendedStatic, recommendedDeflection, spineRating, recommendedRating, gpp, ke, momentum };
  }, [spec, measuredDeflection]);

  const spineStatus = useMemo(() => {
    if (results.spineRating === 0) return null;
    const diff = results.spineRating - results.recommendedRating;
    const pct = Math.abs(diff) / results.recommendedRating * 100;
    if (pct < 8) return { label: 'Properly Spined', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    if (diff > 0) return { label: 'Too Stiff (Strong Spine)', color: 'bg-amber-100 text-amber-800 border-amber-300' };
    return { label: 'Too Weak (Soft Spine)', color: 'bg-red-100 text-red-800 border-red-300' };
  }, [results]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Calculate your arrow's actual dynamic spine for your specific bow setup. Enter your arrow's static deflection (spine tester reading) or use the recommendation as a guide.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Draw Weight (lbs)</Label><Input type="number" value={spec.drawWeight} onChange={e => setSpec({ ...spec, drawWeight: Number(e.target.value) })} className="h-8 text-sm" /></div>
        <div><Label className="text-xs">Draw Length (in)</Label><Input type="number" value={spec.drawLength} onChange={e => setSpec({ ...spec, drawLength: Number(e.target.value) })} className="h-8 text-sm" /></div>
        <div><Label className="text-xs">Arrow Length (in)</Label><Input type="number" value={spec.arrowLength} onChange={e => setSpec({ ...spec, arrowLength: Number(e.target.value) })} className="h-8 text-sm" /></div>
        <div><Label className="text-xs">Point Weight (gr)</Label><Input type="number" value={spec.pointWeight} onChange={e => setSpec({ ...spec, pointWeight: Number(e.target.value) })} className="h-8 text-sm" /></div>
        <div><Label className="text-xs">Fletching (gr total)</Label><Input type="number" value={spec.fletchWeight} onChange={e => setSpec({ ...spec, fletchWeight: Number(e.target.value) })} className="h-8 text-sm" /></div>
        <div><Label className="text-xs">Nock Weight (gr)</Label><Input type="number" value={spec.nockWeight} onChange={e => setSpec({ ...spec, nockWeight: Number(e.target.value) })} className="h-8 text-sm" /></div>
        <div><Label className="text-xs">Insert (gr)</Label><Input type="number" value={spec.insertWeight} onChange={e => setSpec({ ...spec, insertWeight: Number(e.target.value) })} className="h-8 text-sm" /></div>
        <div><Label className="text-xs">IBO Speed (fps)</Label><Input type="number" value={spec.iboSpeed} onChange={e => setSpec({ ...spec, iboSpeed: Number(e.target.value) })} className="h-8 text-sm" /></div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1"><Label className="text-xs">Measured Deflection (in)</Label><Input type="number" step="0.001" placeholder="e.g. 0.500" value={measuredDeflection} onChange={e => setMeasuredDeflection(e.target.value === '' ? '' : Number(e.target.value))} className="h-8 text-sm" /></div>
      </div>

      {results.spineRating > 0 && spineStatus && (
        <div className={`rounded-xl p-3 border ${spineStatus.color}`}>
          <p className="font-semibold text-sm">{spineStatus.label}</p>
          <p className="text-xs mt-1">Your setup acts like a <strong>{results.spineRating}</strong> spine. Recommended: <strong>{results.recommendedRating}</strong> for your bow.</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-secondary/40 rounded-lg p-2">
          <p className="text-lg font-bold">{results.totalWeight > 0 ? Math.round(results.totalWeight) : '-'}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Total Weight (gr)</p>
        </div>
        <div className="bg-secondary/40 rounded-lg p-2">
          <p className="text-lg font-bold">{results.gpp > 0 ? results.gpp.toFixed(1) : '-'}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Grains/Pound</p>
        </div>
        <div className="bg-secondary/40 rounded-lg p-2">
          <p className="text-lg font-bold">{results.ke > 0 ? results.ke.toFixed(1) : '-'}</p>
          <p className="text-[10px] text-muted-foreground uppercase">KE (ft-lbs)</p>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        GPP guide: &lt;5 = speed arrow, 5-6.5 = balanced, 6.5-8 = hunting, &gt;8 = heavy penetrator. KE guide: &lt;25 small game, 25-40 deer, 40-60 elk, &gt;60 dangerous game.
      </p>
    </div>
  );
}

// ============================================================
// 2. PAPER TUNING VISUAL GUIDE
// ============================================================

interface TearPattern {
  id: string;
  label: string;
  description: string;
  adjustment: string;
  severity: 'minor' | 'moderate' | 'severe';
}

const TEAR_PATTERNS: TearPattern[] = [
  { id: 'nock-high', label: 'Nock High', description: 'Tear points upward — nock end is above point', adjustment: 'Move nock point DOWN 1/16" at a time', severity: 'moderate' },
  { id: 'nock-low', label: 'Nock Low', description: 'Tear points downward — nock end is below point', adjustment: 'Move nock point UP 1/16" at a time', severity: 'moderate' },
  { id: 'tail-right', label: 'Tail Right', description: 'Tear kicks right (RH shooter) — stiff spine or weak plunger', adjustment: 'Try heavier point, longer arrow, or move rest/plunger LEFT', severity: 'severe' },
  { id: 'tail-left', label: 'Tail Left', description: 'Tear kicks left (RH shooter) — weak spine or stiff plunger', adjustment: 'Try lighter point, shorter arrow, or move rest/plunger RIGHT', severity: 'severe' },
  { id: 'nock-high-right', label: 'Nock High + Tail Right', description: 'Compound: cord/string stretched or nock too high + stiff spine', adjustment: 'Check cam timing, move nock DOWN, weaken arrow', severity: 'severe' },
  { id: 'nock-low-left', label: 'Nock Low + Tail Left', description: 'Compound: string too short or nock too low + weak spine', adjustment: 'Check cam timing, move nock UP, stiffen arrow', severity: 'severe' },
  { id: 'bullet-hole', label: 'Bullet Hole', description: 'Clean round hole — perfect arrow flight!', adjustment: 'No adjustment needed. Lock it in!', severity: 'minor' },
];

export function PaperTuningGuide() {
  const [selected, setSelected] = useState<string | null>(null);
  const pattern = TEAR_PATTERNS.find(p => p.id === selected);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Shoot through paper at 6-8 feet. Select the tear pattern that matches your result to see the fix.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {TEAR_PATTERNS.map(p => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            className={`text-left p-2.5 rounded-xl border text-sm transition-all ${
              selected === p.id
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'border-border hover:border-primary/50'
            } ${p.id === 'bullet-hole' ? 'col-span-2 text-center bg-emerald-50 border-emerald-200' : ''}`}
          >
            <div className="flex items-center gap-2">
              {/* Visual tear representation */}
              <svg width="32" height="32" className="shrink-0">
                <circle cx="16" cy="16" r="3" fill="currentColor" opacity="0.3" />
                {p.id === 'nock-high' && <line x1="12" y1="8" x2="20" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
                {p.id === 'nock-low' && <line x1="12" y1="24" x2="20" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
                {p.id === 'tail-right' && <line x1="24" y1="12" x2="18" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
                {p.id === 'tail-left' && <line x1="8" y1="12" x2="14" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
                {p.id === 'nock-high-right' && <><line x1="14" y1="6" x2="20" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>}
                {p.id === 'nock-low-left' && <><line x1="14" y1="26" x2="20" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>}
                {p.id === 'bullet-hole' && <circle cx="16" cy="16" r="6" fill="none" stroke="currentColor" strokeWidth="2" />}
              </svg>
              <span className="font-medium text-xs">{p.label}</span>
            </div>
          </button>
        ))}
      </div>

      {pattern && (
        <div className={`rounded-xl p-3 border ${
          pattern.severity === 'minor' ? 'bg-emerald-50 border-emerald-200' :
          pattern.severity === 'moderate' ? 'bg-amber-50 border-amber-200' :
          'bg-red-50 border-red-200'
        }`}>
          <p className="text-sm font-medium">{pattern.description}</p>
          <p className="text-xs mt-1.5"><strong>Fix:</strong> {pattern.adjustment}</p>
          <Badge variant={pattern.severity === 'minor' ? 'default' : pattern.severity === 'moderate' ? 'secondary' : 'destructive'} className="mt-2 text-[10px]">
            {pattern.severity} adjustment
          </Badge>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 3. FOC CALCULATOR WITH VISUALIZATION
// ============================================================

interface FOCMeasurement {
  id: string;
  label: string;
  weight: number; // grains
  position: number; // % from nock (0 = nock, 100 = point)
}

const DEFAULT_FOC_PARTS: FOCMeasurement[] = [
  { id: 'nock', label: 'Nock', weight: 12, position: 0 },
  { id: 'wrap', label: 'Wrap/Vanes', weight: 24, position: 5 },
  { id: 'shaft-rear', label: 'Shaft (rear)', weight: 60, position: 25 },
  { id: 'shaft-mid', label: 'Shaft (mid)', weight: 60, position: 50 },
  { id: 'insert', label: 'Insert', weight: 16, position: 95 },
  { id: 'point', label: 'Point/BH', weight: 100, position: 100 },
];

export function FOCCalculator() {
  const [parts, setParts] = useState<FOCMeasurement[]>(DEFAULT_FOC_PARTS.map(p => ({ ...p })));
  const [shaftLength] = useState(28.5);

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);

  // Balance point calculation (simplified weighted average)
  const balancePoint = useMemo(() => {
    const weightedSum = parts.reduce((s, p) => s + p.weight * p.position, 0);
    return weightedSum / totalWeight;
  }, [parts, totalWeight]);

  // FOC = (Balance - Midpoint) / Total Length * 100
  const foc = ((balancePoint - 50) / 50) * 100;

  const focCategory = useMemo(() => {
    if (foc < 8) return { label: 'Low FOC', desc: 'Flatter trajectory but less wind-resistant. Good for 3D/field.', color: 'text-yellow-600' };
    if (foc < 12) return { label: 'Standard FOC', desc: 'Good all-around balance. Suitable for most hunting.', color: 'text-emerald-600' };
    if (foc < 18) return { label: 'High FOC (EFOC)', desc: 'Better penetration, more stable in wind. Great for hunting.', color: 'text-blue-600' };
    return { label: 'Ultra High FOC (UFOC)', desc: 'Maximum penetration. Best for large game or trad bows.', color: 'text-purple-600' };
  }, [foc]);

  const updatePart = useCallback((id: string, weight: number) => {
    setParts(prev => prev.map(p => p.id === id ? { ...p, weight } : p));
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Front of Center (FOC) measures how much weight is in the front half of your arrow. Higher FOC = better penetration and wind resistance.
      </p>

      {/* Visual FOC bar */}
      <div className="relative h-12 bg-secondary/30 rounded-xl overflow-hidden">
        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-muted-foreground/30" />
        {/* Balance point indicator */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-primary transition-all duration-300"
          style={{ left: `${balancePoint}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary rounded-full" />
        </div>
        {/* Weight distribution */}
        {parts.map(p => (
          <div
            key={p.id}
            className="absolute bottom-0 bg-primary/30 transition-all duration-300 rounded-t"
            style={{
              left: `${Math.max(0, p.position - 5)}%`,
              width: '10%',
              height: `${(p.weight / totalWeight) * 100}%`,
            }}
          />
        ))}
        {/* Labels */}
        <span className="absolute left-1 top-0.5 text-[8px] text-muted-foreground">Nock</span>
        <span className="absolute right-1 top-0.5 text-[8px] text-muted-foreground">Point</span>
        <span className="absolute left-1/2 -translate-x-1/2 bottom-0.5 text-[8px] font-bold text-primary">BP</span>
      </div>

      {/* FOC display */}
      <div className="text-center">
        <p className="text-3xl font-bold">{foc.toFixed(1)}%</p>
        <p className={`text-sm font-medium ${focCategory.color}`}>{focCategory.label}</p>
        <p className="text-xs text-muted-foreground mt-1">{focCategory.desc}</p>
      </div>

      {/* Component weights */}
      <div className="space-y-2">
        {parts.map(p => (
          <div key={p.id} className="flex items-center gap-2">
            <Label className="text-xs w-24 shrink-0">{p.label}</Label>
            <Input
              type="number"
              value={p.weight}
              onChange={e => updatePart(p.id, Number(e.target.value))}
              className="h-7 text-sm"
            />
            <span className="text-xs text-muted-foreground w-8">gr</span>
          </div>
        ))}
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-2 text-center text-xs">
        <div className="bg-secondary/40 rounded-lg p-2">
          <p className="font-bold">{Math.round(totalWeight)} gr</p>
          <p className="text-muted-foreground">Total Weight</p>
        </div>
        <div className="bg-secondary/40 rounded-lg p-2">
          <p className="font-bold">{shaftLength}"</p>
          <p className="text-muted-foreground">Shaft Length</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 4. NOCK TUNING WIZARD
// ============================================================

interface NockTest {
  id: string;
  nockHeight: number; // 1/16" increments from 0
  groupSize: number; // MOA
  nockHigh: boolean; // true = nock high, false = nock low
  notes: string;
}

export function NockTuningWizard() {
  const [tests, setTests] = useState<NockTest[]>([]);
  const [currentHeight, setCurrentHeight] = useState(0); // 1/16" from level
  const [currentGroup, setCurrentGroup] = useState('');
  const [currentHigh, setCurrentHigh] = useState<'high' | 'low' | 'level'>('level');
  const [note, setNote] = useState('');

  const addTest = useCallback(() => {
    const groupSize = parseFloat(currentGroup);
    if (isNaN(groupSize) || groupSize <= 0) { toast.error('Enter a valid group size'); return; }
    const newTest: NockTest = {
      id: Date.now().toString(),
      nockHeight: currentHigh === 'level' ? 0 : currentHigh === 'high' ? Math.abs(currentHeight) : -Math.abs(currentHeight),
      groupSize,
      nockHigh: currentHigh === 'high',
      notes: note,
    };
    setTests(prev => [...prev, newTest].sort((a, b) => a.nockHeight - b.nockHeight));
    setCurrentGroup('');
    setNote('');
    toast.success('Test recorded');
  }, [currentHeight, currentGroup, currentHigh, note]);

  // Find best nock height
  const bestTest = useMemo(() => {
    if (tests.length === 0) return null;
    return tests.reduce((best, t) => t.groupSize < best.groupSize ? t : best);
  }, [tests]);

  // Trend analysis
  const trend = useMemo(() => {
    if (tests.length < 3) return null;
    const sorted = [...tests].sort((a, b) => a.nockHeight - b.nockHeight);
    const highTests = sorted.filter(t => t.nockHeight > 0);
    const lowTests = sorted.filter(t => t.nockHeight < 0);
    const levelTests = sorted.filter(t => t.nockHeight === 0);

    const highAvg = highTests.length ? highTests.reduce((s, t) => s + t.groupSize, 0) / highTests.length : Infinity;
    const lowAvg = lowTests.length ? lowTests.reduce((s, t) => s + t.groupSize, 0) / lowTests.length : Infinity;
    const levelAvg = levelTests.length ? levelTests.reduce((s, t) => s + t.groupSize, 0) / levelTests.length : Infinity;

    if (levelAvg <= highAvg && levelAvg <= lowAvg) return 'Level nock point looks best for your setup.';
    if (highAvg < lowAvg) return 'Nock HIGH is performing better. Try going higher.';
    return 'Nock LOW is performing better. Try going lower.';
  }, [tests]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Systematically test different nock heights. Shoot 3-arrow groups at each setting and record the group size (MOA). The wizard finds your optimal nock point.
      </p>

      {/* Input */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="text-xs">Nock Height</Label>
          <div className="flex gap-1 mt-1">
            <Button size="sm" variant={currentHigh === 'low' ? 'default' : 'outline'} onClick={() => setCurrentHigh('low')} className="h-7 text-xs flex-1">Low</Button>
            <Button size="sm" variant={currentHigh === 'level' ? 'default' : 'outline'} onClick={() => setCurrentHigh('level')} className="h-7 text-xs flex-1">Level</Button>
            <Button size="sm" variant={currentHigh === 'high' ? 'default' : 'outline'} onClick={() => setCurrentHigh('high')} className="h-7 text-xs flex-1">High</Button>
          </div>
        </div>
        <div className="w-20">
          <Label className="text-xs">1/16"</Label>
          <Input type="number" value={currentHeight} onChange={e => setCurrentHeight(Number(e.target.value))} className="h-7 text-sm" />
        </div>
        <div className="w-20">
          <Label className="text-xs">Group MOA</Label>
          <Input type="number" value={currentGroup} onChange={e => setCurrentGroup(e.target.value)} className="h-7 text-sm" placeholder="MOA" />
        </div>
      </div>
      <div className="flex gap-2">
        <Input placeholder="Notes (optional)" value={note} onChange={e => setNote(e.target.value)} className="h-7 text-sm flex-1" />
        <Button size="sm" onClick={addTest} className="h-7">Add Test</Button>
      </div>

      {/* Best result */}
      {bestTest && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <p className="text-sm font-semibold text-emerald-800">Best Setting Found</p>
          <p className="text-xs text-emerald-700">
            Nock {bestTest.nockHeight === 0 ? 'level' : bestTest.nockHigh ? `high ${bestTest.nockHeight}/16"` : `low ${Math.abs(bestTest.nockHeight)}/16"`}
            {' — '}Group: {bestTest.groupSize} MOA
          </p>
        </div>
      )}

      {/* Trend */}
      {trend && (
        <div className="bg-primary/10 rounded-xl p-2.5 text-xs">
          <strong>Trend:</strong> {trend}
        </div>
      )}

      {/* Test history */}
      <div className="space-y-1">
        {tests.map(t => (
          <div key={t.id} className="flex items-center justify-between text-xs border rounded-lg p-2">
            <span className="font-medium">
              {t.nockHeight === 0 ? 'Level' : t.nockHigh ? `+${t.nockHeight}/16"` : `-${Math.abs(t.nockHeight)}/16"`}
            </span>
            <span>{t.groupSize} MOA</span>
            {t.notes && <span className="text-muted-foreground">{t.notes}</span>}
            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setTests(prev => prev.filter(x => x.id !== t.id))}>
              <span className="text-destructive">x</span>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 5. CENTER SHOT WIZARD
// ============================================================

interface CenterShotStep {
  step: number;
  title: string;
  instruction: string;
  checkItem: string;
}

const CENTER_SHOT_STEPS: CenterShotStep[] = [
  { step: 1, title: 'Initial Setup', instruction: 'Set rest so arrow runs through deepest part of Berger button hole (recurve) or center of rest hole (compound).', checkItem: 'Arrow is visually centered on rest' },
  { step: 2, title: 'String Alignment', instruction: 'Stand behind bow. Bowstring should bisect riser and line up with arrow. Adjust rest L/R until string appears to run down center of arrow.', checkItem: 'String bisects arrow when viewed from behind' },
  { step: 3, title: 'Paper Tune at 6ft', instruction: 'Shoot through paper at 6 feet. Record tear direction.', checkItem: 'Paper tear recorded' },
  { step: 4, title: 'Micro-Adjust', instruction: 'For tail-left tear: move rest RIGHT 1/32". For tail-right: move rest LEFT 1/32". Re-shoot paper.', checkItem: 'Rest adjusted and re-tested' },
  { step: 5, title: 'Walk-Back Verification', instruction: 'Shoot at 10, 20, 30, 40 yards aiming at same point. Groups should stay vertical. If they drift left/right, center shot needs more adjustment.', checkItem: 'Walk-back test complete' },
  { step: 6, title: 'Lock It In', instruction: 'Once paper tune is bullet hole and walk-back is vertical, lock your rest settings. Record measurements for future reference.', checkItem: 'Settings recorded in app' },
];

export function CenterShotWizard() {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [currentStep, setCurrentStep] = useState(0);

  const toggleStep = (step: number) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  };

  const progress = Math.round((completedSteps.size / CENTER_SHOT_STEPS.length) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Step-by-step center shot calibration</p>
        <Badge variant="secondary" className="text-xs">{completedSteps.size}/{CENTER_SHOT_STEPS.length}</Badge>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {CENTER_SHOT_STEPS.map((s, i) => (
          <div
            key={s.step}
            className={`border rounded-xl p-3 transition-all ${
              completedSteps.has(s.step) ? 'bg-emerald-50 border-emerald-200' : 'border-border'
            } ${currentStep === i ? 'ring-1 ring-primary' : ''}`}
            onClick={() => setCurrentStep(i)}
          >
            <div className="flex items-start gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); toggleStep(s.step); }}
                className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  completedSteps.has(s.step)
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-muted-foreground'
                }`}
              >
                {completedSteps.has(s.step) && '✓'}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{s.step}. {s.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.instruction}</p>
                <p className="text-[10px] text-primary mt-1 font-medium">☑ {s.checkItem}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {progress === 100 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="text-sm font-semibold text-emerald-800">Center shot calibrated!</p>
          <p className="text-xs text-emerald-600">Your bow is now properly tuned. Record these settings.</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 6. BROADHEAD TUNING TRACKER
// ============================================================

interface BroadheadTest {
  id: string;
  broadheadBrand: string;
  broadheadWeight: number;
  fieldPointGroup: number; // MOA
  broadheadGroup: number; // MOA
  horizontalShift: number; // inches right(+) left(-)
  verticalShift: number; // inches up(+) down(-)
  distance: number; // yards
  date: string;
}

export function BroadheadTuningTracker() {
  const [tests, setTests] = useState<BroadheadTest[]>([]);
  const [brand, setBrand] = useState('');
  const [bhWeight, setBhWeight] = useState(100);
  const [fpGroup, setFpGroup] = useState('');
  const [bhGroup, setBhGroup] = useState('');
  const [hShift, setHShift] = useState('');
  const [vShift, setVShift] = useState('');
  const [dist, setDist] = useState(30);

  const addTest = useCallback(() => {
    if (!brand.trim()) { toast.error('Enter broadhead brand'); return; }
    const test: BroadheadTest = {
      id: Date.now().toString(),
      broadheadBrand: brand,
      broadheadWeight: bhWeight,
      fieldPointGroup: parseFloat(fpGroup) || 0,
      broadheadGroup: parseFloat(bhGroup) || 0,
      horizontalShift: parseFloat(hShift) || 0,
      verticalShift: parseFloat(vShift) || 0,
      distance: dist,
      date: new Date().toISOString().split('T')[0],
    };
    setTests(prev => [test, ...prev]);
    setBrand('');
    setFpGroup('');
    setBhGroup('');
    setHShift('');
    setVShift('');
    toast.success('Broadhead test recorded');
  }, [brand, bhWeight, fpGroup, bhGroup, hShift, vShift, dist]);

  // Analysis per brand
  const brandAnalysis = useMemo(() => {
    const byBrand: Record<string, BroadheadTest[]> = {};
    tests.forEach(t => {
      if (!byBrand[t.broadheadBrand]) byBrand[t.broadheadBrand] = [];
      byBrand[t.broadheadBrand].push(t);
    });

    return Object.entries(byBrand).map(([name, ts]) => {
      const avgShiftH = ts.reduce((s, t) => s + t.horizontalShift, 0) / ts.length;
      const avgShiftV = ts.reduce((s, t) => s + t.verticalShift, 0) / ts.length;
      const avgFpGroup = ts.reduce((s, t) => s + t.fieldPointGroup, 0) / ts.length;
      const avgBhGroup = ts.reduce((s, t) => s + t.broadheadGroup, 0) / ts.length;
      const impactDiff = Math.sqrt(avgShiftH ** 2 + avgShiftV ** 2);

      let rec = '';
      if (impactDiff < 1) rec = 'Excellent match! Broadheads group with field points.';
      else if (impactDiff < 3) rec = 'Minor impact shift. Try micro-adjusting rest/plunger.';
      else if (avgBhGroup > avgFpGroup * 1.5) rec = 'Broadheads group much larger. Check arrow spine and broadhead alignment.';
      else rec = 'Significant impact shift. Adjust rest toward broadhead impact, or re-tune with these broadheads.';

      return { name, avgShiftH, avgShiftV, avgFpGroup, avgBhGroup, impactDiff, count: ts.length, rec };
    });
  }, [tests]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Track how your broadheads fly compared to field points. Log impact shifts and group sizes to find the right heads for your setup.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Broadhead Brand</Label><Input value={brand} onChange={e => setBrand(e.target.value)} className="h-8 text-sm" placeholder="e.g. SEVR 100" /></div>
        <div><Label className="text-xs">Weight (gr)</Label><Input type="number" value={bhWeight} onChange={e => setBhWeight(Number(e.target.value))} className="h-8 text-sm" /></div>
        <div><Label className="text-xs">FP Group (MOA)</Label><Input type="number" value={fpGroup} onChange={e => setFpGroup(e.target.value)} className="h-8 text-sm" placeholder="MOA" /></div>
        <div><Label className="text-xs">BH Group (MOA)</Label><Input type="number" value={bhGroup} onChange={e => setBhGroup(e.target.value)} className="h-8 text-sm" placeholder="MOA" /></div>
        <div><Label className="text-xs">H-Shift (in)</Label><Input type="number" value={hShift} onChange={e => setHShift(e.target.value)} className="h-8 text-sm" placeholder="Right + / Left -" /></div>
        <div><Label className="text-xs">V-Shift (in)</Label><Input type="number" value={vShift} onChange={e => setVShift(e.target.value)} className="h-8 text-sm" placeholder="Up + / Down -" /></div>
        <div><Label className="text-xs">Distance (yd)</Label><Input type="number" value={dist} onChange={e => setDist(Number(e.target.value))} className="h-8 text-sm" /></div>
        <Button size="sm" onClick={addTest} className="h-8 mt-5">Add Test</Button>
      </div>

      {/* Brand analysis */}
      {brandAnalysis.map(b => (
        <div key={b.name} className={`rounded-xl p-3 border ${
          b.impactDiff < 1 ? 'bg-emerald-50 border-emerald-200' : b.impactDiff < 3 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{b.name}</p>
            <Badge variant="secondary" className="text-[10px]">{b.count} tests</Badge>
          </div>
          <div className="flex gap-3 mt-1 text-xs">
            <span>Impact shift: {b.impactDiff.toFixed(1)}"</span>
            <span>FP: {b.avgFpGroup.toFixed(1)} MOA</span>
            <span>BH: {b.avgBhGroup.toFixed(1)} MOA</span>
          </div>
          <p className="text-xs mt-1.5 font-medium">{b.rec}</p>
        </div>
      ))}
    </div>
  );
}
