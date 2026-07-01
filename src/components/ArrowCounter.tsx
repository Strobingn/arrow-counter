import { useState, useEffect, useRef } from 'react';
import { Plus, Minus, Check, X, MapPin, Edit2, Trophy, Crosshair, Target, RotateCcw, RotateCw, Ruler, Thermometer, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { LocationMap } from './LocationMap';
import { Geolocation } from '@capacitor/geolocation';
import type { Location, BowProfile, EndScore, ArrowSession } from '@/types';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface ArrowCounterProps {
  todayTotal: number;
  goal: number;
  onSetGoal: (goal: number) => void;
  onAdd: (count: number, note?: string, location?: Location, opts?: {
    bowId?: string; distance?: number; distanceUnit?: 'yards' | 'meters';
    weather?: string; temperature?: number; endScores?: EndScore[]; groupingQuality?: ArrowSession['groupingQuality'];
  }) => void;
  onAddOne: () => void;
  onRemoveOne: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  formatNumber: (num: number) => string;
  bowProfiles: BowProfile[];
  defaultBow?: BowProfile;
  quickAddPresets: number[];
  playThwack: (freq?: number) => void;
  playGoal: () => void;
  soundEnabled: boolean;
}

export function ArrowCounter({
  todayTotal, goal, onSetGoal, onAdd, onAddOne, onRemoveOne, onUndo, onRedo,
  canUndo, canRedo, formatNumber, bowProfiles, defaultBow, quickAddPresets,
  playThwack, playGoal, soundEnabled,
}: ArrowCounterProps) {
  const [count, setCount] = useState(6);
  const [note, setNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [location, setLocation] = useState<Location | undefined>(undefined);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [tempGoal, setTempGoal] = useState(goal);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const prevTotalRef = useRef(todayTotal);

  // Equipment
  const [selectedBowId, setSelectedBowId] = useState<string | undefined>(defaultBow?.id);
  const [distance, setDistance] = useState<number | undefined>(undefined);
  const [distanceUnit, setDistanceUnit] = useState<'yards' | 'meters'>('yards');
  const [showEquipment, setShowEquipment] = useState(false);

  // Weather
  const [weather, setWeather] = useState('');
  const [temperature, setTemperature] = useState<number | undefined>(undefined);
  const [showWeather, setShowWeather] = useState(false);

  // Score tracking
  const [showScoreTracker, setShowScoreTracker] = useState(false);
  const [currentEndArrows, setCurrentEndArrows] = useState<(string | null)[]>([null, null, null, null, null, null]);
  const [endScores, setEndScores] = useState<EndScore[]>([]);
  const [groupingQuality, setGroupingQuality] = useState<ArrowSession['groupingQuality']>(undefined);

  useEffect(() => { if (defaultBow && !selectedBowId) setSelectedBowId(defaultBow.id); }, [defaultBow, selectedBowId]);

  const increment = () => { setCount(c => c + 1); if (soundEnabled) playThwack(220); };
  const decrement = () => setCount(c => Math.max(1, c - 1));

  const handleAdd = () => {
    onAdd(count, note || undefined, location, {
      bowId: selectedBowId,
      distance,
      distanceUnit,
      weather: weather || undefined,
      temperature,
      endScores: endScores.length > 0 ? endScores : undefined,
      groupingQuality,
    });
    setCount(6); setNote(''); setLocation(undefined); setShowNoteInput(false);
    setShowLocationPicker(false); setDistance(undefined); setWeather('');
    setTemperature(undefined); setShowWeather(false); setShowEquipment(false);
    setEndScores([]); setCurrentEndArrows([null, null, null, null, null, null]);
    setShowScoreTracker(false); setGroupingQuality(undefined);
    if (soundEnabled) playThwack(180);
  };

  const quickAdd = (amount: number) => {
    onAdd(amount, undefined, undefined, { bowId: selectedBowId });
    if (soundEnabled) playThwack(200 + amount * 5);
  };

  const handleGetCurrentLocation = async () => {
    try {
      const permission = await Geolocation.requestPermissions();
      if (permission.location === 'denied') return;
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const prev = prevTotalRef.current;
    if (todayTotal > prev && todayTotal >= goal && prev < goal) {
      setIsCelebrating(true);
      if (soundEnabled) playGoal();
      toast.success(`Daily goal of ${goal} reached! Great shooting!`, { duration: 4500 });
      const t = setTimeout(() => setIsCelebrating(false), 900);
      return () => clearTimeout(t);
    }
    prevTotalRef.current = todayTotal;
  }, [todayTotal, goal, soundEnabled, playGoal]);

  useEffect(() => { setTempGoal(goal); }, [goal]);

  const progress = Math.min(100, Math.round((todayTotal / goal) * 100));
  const remaining = Math.max(0, goal - todayTotal);
  const isComplete = todayTotal >= goal;
  const overBy = isComplete ? todayTotal - goal : 0;
  const ringSize = 148, strokeW = 11, ringRadius = (ringSize - strokeW) / 2;
  const ringCirc = ringRadius * 2 * Math.PI;
  const ringOffset = ringCirc - (Math.min(progress, 100) / 100) * ringCirc;

  // Score tracker functions
  const setArrowScore = (idx: number, score: string) => {
    const next = [...currentEndArrows];
    next[idx] = score;
    setCurrentEndArrows(next);
  };
  const saveEnd = () => {
    if (currentEndArrows.every(a => a === null)) return;
    setEndScores(prev => [...prev, { id: Date.now().toString(36), arrows: [...currentEndArrows] }]);
    setCurrentEndArrows([null, null, null, null, null, null]);
  };
  const clearEnd = () => setCurrentEndArrows([null, null, null, null, null, null]);

  return (
    <div className="flex flex-col items-center py-6">
      {/* Streak + Goal info */}
      <div className="text-center mb-2 w-full">
        <div className="flex items-center justify-center gap-2 mb-1">
          <p className="text-sm text-muted-foreground">Today's Arrows</p>
          <Button variant="ghost" size="icon" onClick={() => { setTempGoal(goal); setIsGoalDialogOpen(true); }}
            className="w-7 h-7 rounded-full opacity-70 hover:opacity-100 transition-all hover:scale-105 active:scale-95 -mr-1" aria-label="Edit daily goal">
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Progress Ring */}
        <div onClick={() => { setTempGoal(goal); setIsGoalDialogOpen(true); }}
          className={cn('relative mx-auto cursor-pointer select-none transition-all duration-200 active:scale-[0.985]', isCelebrating && 'scale-105')}
          style={{ width: ringSize, height: ringSize }} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsGoalDialogOpen(true); } }}
          aria-label={`Progress: ${todayTotal} of ${goal} arrows. ${isComplete ? 'Goal achieved' : progress + '%'}`}>
          <div className="absolute inset-0 rounded-full bg-secondary/60" style={{ padding: 4 }} />
          <svg width={ringSize} height={ringSize} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={ringSize / 2} cy={ringSize / 2} r={ringRadius} fill="none" stroke="currentColor" className="text-muted/30" strokeWidth={strokeW} strokeLinecap="round" />
            <circle cx={ringSize / 2} cy={ringSize / 2} r={ringRadius} fill="none"
              className={cn('transition-[stroke-dashoffset,stroke] duration-500 ease-out', isComplete ? 'stroke-emerald-500' : 'stroke-primary')}
              strokeWidth={strokeW} strokeLinecap="round" strokeDasharray={ringCirc} strokeDashoffset={ringOffset} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={cn('text-5xl font-bold tabular-nums transition-all duration-300', isComplete ? 'text-emerald-600' : 'text-primary', isCelebrating && 'scale-110')}>
              {formatNumber(todayTotal)}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium tracking-[1px] -mt-0.5">OF {goal}</div>
            {isComplete && <Trophy className="w-4 h-4 text-emerald-500 mt-0.5 animate-pulse" />}
          </div>
        </div>

        <div className="mt-3 text-center">
          <div className="text-xs font-medium text-muted-foreground">
            Goal: <span className="text-foreground font-semibold tabular-nums">{goal}</span>{isComplete && <span className="ml-1 text-emerald-600">(achieved)</span>}
          </div>
          <div className={cn('mt-0.5 text-sm font-semibold', isComplete ? 'text-emerald-600' : 'text-muted-foreground')}>
            {isComplete ? `Exceeded by ${overBy} arrows` : `${remaining} remaining`} &bull; {progress}%
          </div>
        </div>
      </div>

      {/* Undo/Redo */}
      <div className="flex gap-2 mb-3">
        <Button variant="ghost" size="sm" onClick={onUndo} disabled={!canUndo} className="text-xs gap-1"><RotateCcw className="w-3.5 h-3.5" />Undo</Button>
        <Button variant="ghost" size="sm" onClick={onRedo} disabled={!canRedo} className="text-xs gap-1">Redo<RotateCw className="w-3.5 h-3.5" /></Button>
      </div>

      {/* Goal Dialog */}
      <Dialog open={isGoalDialogOpen} onOpenChange={setIsGoalDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Set Daily Goal</DialogTitle>
            <DialogDescription>Choose how many arrows you aim to shoot each day.</DialogDescription>
          </DialogHeader>
          <div className="py-4 flex flex-col items-center gap-3">
            <Input type="number" value={tempGoal} onChange={(e) => setTempGoal(isNaN(parseInt(e.target.value)) ? 30 : Math.max(1, Math.min(500, parseInt(e.target.value))))}
              className="w-32 h-16 text-center text-4xl font-bold tabular-nums rounded-2xl border-2" min={1} max={500} autoFocus />
            <div className="text-sm text-muted-foreground">arrows per day</div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsGoalDialogOpen(false)} className="flex-1 rounded-full border-2">Cancel</Button>
            <Button onClick={() => { onSetGoal(tempGoal); setIsGoalDialogOpen(false); }}
              className="flex-1 h-11 rounded-full text-base font-semibold bg-gray-700 hover:bg-gray-600 text-white border-2 border-white hover:scale-105 active:scale-95">Save Goal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Counter */}
      <div className="flex items-center gap-4 mb-4">
        <Button variant="secondary" size="icon" onClick={decrement}
          className="w-14 h-14 rounded-full text-xl transition-all hover:scale-105 active:scale-95 bg-gray-700 hover:bg-gray-600 border-2 border-white text-white">
          <Minus className="w-6 h-6" />
        </Button>
        <div className="w-24 h-20 flex items-center justify-center bg-secondary rounded-2xl">
          <span className="text-4xl font-bold text-primary tabular-nums">{count}</span>
        </div>
        <Button variant="secondary" size="icon" onClick={increment}
          className="w-14 h-14 rounded-full text-xl transition-all hover:scale-105 active:scale-95 bg-gray-700 hover:bg-gray-600 border-2 border-white text-white">
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {/* Bow Selection */}
      {showEquipment && (
        <div className="w-full max-w-xs mb-4 space-y-2 animate-in fade-in slide-in-from-top-2">
          <Select value={selectedBowId || ''} onValueChange={setSelectedBowId}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select bow" /></SelectTrigger>
            <SelectContent>
              {bowProfiles.map(b => <SelectItem key={b.id} value={b.id}><Crosshair className="w-3 h-3 mr-1 inline" />{b.name}</SelectItem>)}
              {bowProfiles.length === 0 && <SelectItem value="none" disabled>No bows added</SelectItem>}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Ruler className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input type="number" placeholder="Dist" value={distance || ''} onChange={e => setDistance(Number(e.target.value) || undefined)}
                className="pl-7 rounded-xl" />
            </div>
            <Select value={distanceUnit} onValueChange={(v) => setDistanceUnit(v as 'yards' | 'meters')}>
              <SelectTrigger className="w-20 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="yards">yd</SelectItem><SelectItem value="meters">m</SelectItem></SelectContent>
            </Select>
          </div>
          <Select value={groupingQuality || ''} onValueChange={(v) => setGroupingQuality(v as ArrowSession['groupingQuality'])}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Grouping quality" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tight">Tight group</SelectItem>
              <SelectItem value="good">Good group</SelectItem>
              <SelectItem value="loose">Loose group</SelectItem>
              <SelectItem value="scatter">Scattered</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Weather */}
      {showWeather && (
        <div className="w-full max-w-xs mb-4 space-y-2 animate-in fade-in slide-in-from-top-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Cloud className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Conditions" value={weather} onChange={e => setWeather(e.target.value)} className="pl-7 rounded-xl" />
            </div>
            <div className="w-20 relative">
              <Thermometer className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input type="number" placeholder="F" value={temperature || ''} onChange={e => setTemperature(Number(e.target.value) || undefined)} className="pl-7 rounded-xl" />
            </div>
          </div>
        </div>
      )}

      {/* Score Tracker */}
      {showScoreTracker && (
        <div className="w-full max-w-xs mb-4 animate-in fade-in slide-in-from-top-2">
          {/* Saved ends */}
          {endScores.length > 0 && (
            <div className="mb-2 space-y-1">
              {endScores.map((end, ei) => (
                <div key={end.id} className="flex items-center gap-1 text-xs bg-secondary/50 rounded-lg px-2 py-1">
                  <span className="text-muted-foreground w-8">End {ei + 1}:</span>
                  {end.arrows.map((a, ai) => (
                    <span key={ai} className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${a === 'X' ? 'bg-red-500 text-white' : a === '10' ? 'bg-yellow-500 text-white' : a === 'M' ? 'bg-gray-400 text-white' : 'bg-primary/10 text-primary'}`}>
                      {a ?? '-'}
                    </span>
                  ))}
                  <span className="ml-auto font-semibold">
                    {end.arrows.reduce((sum, a) => sum + (a === 'X' ? 10 : a === 'M' ? 0 : Number(a) || 0), 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* Current end */}
          <div className="border rounded-xl p-2">
            <p className="text-xs text-muted-foreground mb-1.5 text-center">Current End ({endScores.length + 1})</p>
            <div className="flex justify-center gap-1 flex-wrap">
              {currentEndArrows.map((arrow, idx) => (
                <div key={idx} className="flex flex-col items-center gap-0.5">
                  <div className="flex gap-0.5">
                    {['X', '10', '9', '8', '7', 'M'].map(score => (
                      <button key={score} onClick={() => setArrowScore(idx, score)}
                        className={`w-6 h-6 rounded-full text-[9px] font-bold transition-all ${currentEndArrows[idx] === score ? 'bg-primary text-white scale-110' : 'bg-secondary hover:bg-primary/20'}`}>
                        {score}
                      </button>
                    ))}
                  </div>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${arrow === 'X' ? 'bg-red-500 text-white' : arrow === 'M' ? 'bg-gray-400 text-white' : arrow ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {arrow ?? '-'}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={clearEnd}>Clear</Button>
              <Button size="sm" className="flex-1 text-xs" onClick={saveEnd}>Save End</Button>
            </div>
          </div>
        </div>
      )}

      {/* Note */}
      {showNoteInput && (
        <div className="w-full max-w-xs mb-4 animate-in fade-in slide-in-from-top-2">
          <Input placeholder="Add a note (optional)..." value={note} onChange={(e) => setNote(e.target.value)} className="rounded-xl" autoFocus />
        </div>
      )}

      {/* Location */}
      {showLocationPicker && (
        <div className="w-full max-w-xs mb-4 animate-in fade-in slide-in-from-top-2">
          <LocationMap mode="picker" height="180px" initialLocation={location} onLocationSelect={(loc) => setLocation(loc)} />
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={handleGetCurrentLocation} className="flex-1"><MapPin className="w-4 h-4 mr-1" />Use My Location</Button>
            <Button size="sm" variant="ghost" onClick={() => { setLocation(undefined); setShowLocationPicker(false); }}>Remove</Button>
          </div>
        </div>
      )}

      {/* Main Add Button */}
      <Button onClick={handleAdd}
        className="h-14 px-8 rounded-full text-lg font-semibold transition-all duration-150 bg-gray-700 hover:bg-gray-600 text-white border-2 border-white hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl mb-4">
        <Check className="w-5 h-5 mr-2" />Add {count} Arrow{count !== 1 ? 's' : ''}
      </Button>

      {/* Toggle Buttons */}
      <div className="flex flex-wrap justify-center gap-1.5 mb-2">
        <Button variant="ghost" size="sm" onClick={() => setShowNoteInput(!showNoteInput)} className={cn('text-muted-foreground text-xs', showNoteInput && 'text-primary bg-primary/10')}>
          {showNoteInput ? <><X className="w-3.5 h-3.5 mr-1" />Note</> : '+ Note'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowLocationPicker(!showLocationPicker)} className={cn('text-muted-foreground text-xs', (showLocationPicker || location) && 'text-primary bg-primary/10')}>
          <MapPin className="w-3.5 h-3.5 mr-1" />{showLocationPicker ? 'Hide Map' : location ? 'Location Set' : 'Location'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowEquipment(!showEquipment)} className={cn('text-muted-foreground text-xs', showEquipment && 'text-primary bg-primary/10')}>
          <Crosshair className="w-3.5 h-3.5 mr-1" />{showEquipment ? 'Hide Gear' : 'Gear'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowScoreTracker(!showScoreTracker)} className={cn('text-muted-foreground text-xs', showScoreTracker && 'text-primary bg-primary/10')}>
          <Target className="w-3.5 h-3.5 mr-1" />{showScoreTracker ? 'Hide Scores' : 'Scores'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowWeather(!showWeather)} className={cn('text-muted-foreground text-xs', showWeather && 'text-primary bg-primary/10')}>
          <Cloud className="w-3.5 h-3.5 mr-1" />{showWeather ? 'Hide Wx' : 'Weather'}
        </Button>
      </div>

      {/* Quick Add */}
      <div className="flex flex-wrap justify-center gap-2 mt-4">
        <Button variant="outline" onClick={onRemoveOne} className="rounded-full px-4 bg-gray-700 hover:bg-gray-600 border-2 border-white text-white hover:scale-105 active:scale-95">-1</Button>
        <Button variant="outline" onClick={onAddOne} className="rounded-full px-4 bg-gray-700 hover:bg-gray-600 border-2 border-white text-white hover:scale-105 active:scale-95">+1</Button>
        {quickAddPresets.map((amount) => (
          <Button key={amount} variant="outline" onClick={() => quickAdd(amount)}
            className="rounded-full px-4 bg-gray-700 hover:bg-gray-600 border-2 border-white text-white hover:scale-105 active:scale-95">
            +{amount}
          </Button>
        ))}
      </div>
    </div>
  );
}
