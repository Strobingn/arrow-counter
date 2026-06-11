import { useState, useEffect, useRef } from 'react';
import { Plus, Minus, Check, X, MapPin, Edit2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { LocationMap } from './LocationMap';
import { Geolocation } from '@capacitor/geolocation';
import type { Location } from '@/types';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ArrowCounterProps {
  todayTotal: number;
  goal: number;
  onSetGoal: (goal: number) => void;
  onAdd: (count: number, note?: string, location?: Location) => void;
  onAddOne: () => void;
  onRemoveOne: () => void;
  formatNumber: (num: number) => string;
}

export function ArrowCounter({ todayTotal, goal, onSetGoal, onAdd, onAddOne, onRemoveOne, formatNumber }: ArrowCounterProps) {
  const [count, setCount] = useState(6);
  const [note, setNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [location, setLocation] = useState<Location | undefined>(undefined);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [tempGoal, setTempGoal] = useState(goal);

  const [isCelebrating, setIsCelebrating] = useState(false);
  const prevTotalRef = useRef(todayTotal);

  const increment = () => setCount((c) => c + 1);
  const decrement = () => setCount((c) => Math.max(1, c - 1));

  const handleAdd = () => {
    onAdd(count, note || undefined, location);
    setCount(6);
    setNote('');
    setLocation(undefined);
    setShowNoteInput(false);
    setShowLocationPicker(false);
  };

  const quickAdd = (amount: number) => {
    onAdd(amount);
  };

  const handleGetCurrentLocation = async () => {
    try {
      const permission = await Geolocation.requestPermissions();
      if (permission.location === 'denied') {
        return;
      }
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      // ignore error
    }
  };

  const openGoalDialog = () => {
    setTempGoal(goal);
    setIsGoalDialogOpen(true);
  };

  const saveGoal = () => {
    if (tempGoal !== goal) {
      onSetGoal(tempGoal);
      toast.success('Daily goal updated to ' + tempGoal + ' arrows');
    }
    setIsGoalDialogOpen(false);
  };

  const cancelGoalDialog = () => {
    setIsGoalDialogOpen(false);
  };

  useEffect(() => {
    const prev = prevTotalRef.current;
    if (todayTotal > prev && todayTotal >= goal && prev < goal) {
      setIsCelebrating(true);
      toast.success(`🎯 Daily goal of ${goal} reached! Great shooting!`, { duration: 4500 });
      const t = setTimeout(() => setIsCelebrating(false), 900);
      return () => clearTimeout(t);
    }
    prevTotalRef.current = todayTotal;
  }, [todayTotal, goal]);

  useEffect(() => {
    setTempGoal(goal);
  }, [goal]);

  const progress = Math.min(100, Math.round((todayTotal / goal) * 100));
  const remaining = Math.max(0, goal - todayTotal);
  const isComplete = todayTotal >= goal;
  const overBy = isComplete ? todayTotal - goal : 0;

  const ringSize = 148;
  const strokeW = 11;
  const ringRadius = (ringSize - strokeW) / 2;
  const ringCirc = ringRadius * 2 * Math.PI;
  const ringOffset = ringCirc - (Math.min(progress, 100) / 100) * ringCirc;

  return (
    <div className="flex flex-col items-center py-6">
      <div className="text-center mb-2">
        <div className="flex items-center justify-center gap-2 mb-1">
          <p className="text-sm text-muted-foreground">Today's Arrows</p>
          <Button
            variant="ghost"
            size="icon"
            onClick={openGoalDialog}
            className="w-7 h-7 rounded-full opacity-70 hover:opacity-100 transition-all hover:scale-105 active:scale-95 -mr-1"
            title="Tap to edit daily goal"
            aria-label="Edit daily goal"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div
          onClick={openGoalDialog}
          className={cn(
            'relative mx-auto cursor-pointer select-none transition-all duration-200 active:scale-[0.985]',
            isCelebrating && 'scale-105'
          )}
          style={{ width: ringSize, height: ringSize }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGoalDialog(); } }}
          aria-label={`Current progress: ${todayTotal} of ${goal} arrows. ${isComplete ? 'Goal achieved' : progress + '% complete'}. Tap to edit goal.`}
        >
          <div className="absolute inset-0 rounded-full bg-secondary/60" style={{ padding: 4 }} />
          <svg
            width={ringSize}
            height={ringSize}
            className="absolute inset-0"
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle cx={ringSize / 2} cy={ringSize / 2} r={ringRadius} fill="none" stroke="currentColor" className="text-muted/30" strokeWidth={strokeW} strokeLinecap="round" />
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={ringRadius}
              fill="none"
              className={cn('transition-[stroke-dashoffset,stroke] duration-500 ease-out', isComplete ? 'stroke-emerald-500' : 'stroke-primary')}
              strokeWidth={strokeW}
              strokeLinecap="round"
              strokeDasharray={ringCirc}
              strokeDashoffset={ringOffset}
            />
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
          <div className="text-xs font-medium text-muted-foreground">Goal: <span className="text-foreground font-semibold tabular-nums">{goal}</span>{isComplete && <span className="ml-1 text-emerald-600">(achieved)</span>}</div>
          <div className={cn('mt-0.5 text-sm font-semibold', isComplete ? 'text-emerald-600' : 'text-muted-foreground')}>
            {isComplete ? `Exceeded by ${overBy} • 100%` : `${remaining} remaining • ${progress}%`}
          </div>
        </div>
      </div>

      <Dialog open={isGoalDialogOpen} onOpenChange={setIsGoalDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Set Daily Goal</DialogTitle>
            <DialogDescription>
              Choose how many arrows you aim to shoot each day. Changes save instantly.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 flex flex-col items-center gap-3">
            <Input
              type="number"
              value={tempGoal}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setTempGoal(isNaN(v) ? 30 : Math.max(1, Math.min(500, v)));
              }}
              className="w-32 h-16 text-center text-4xl font-bold tabular-nums rounded-2xl border-2"
              min={1}
              max={500}
              autoFocus
            />
            <div className="text-sm text-muted-foreground">arrows per day</div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={cancelGoalDialog} className="flex-1 rounded-full border-2">Cancel</Button>
            <Button
              onClick={saveGoal}
              className={cn(
                'flex-1 h-11 rounded-full text-base font-semibold transition-all duration-150',
                'bg-gray-700 hover:bg-gray-600 text-white border-2 border-white',
                'hover:scale-105 active:scale-95'
              )}
            >
              Save Goal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-4 mb-4">
        <Button
          variant="secondary"
          size="icon"
          onClick={decrement}
          className="w-14 h-14 rounded-full text-xl transition-all duration-150 hover:scale-105 active:scale-95 bg-gray-700 hover:bg-gray-600 border-2 border-white text-white"
        >
          <Minus className="w-6 h-6" />
        </Button>
        <div className="w-24 h-20 flex items-center justify-center bg-secondary rounded-2xl">
          <span className="text-4xl font-bold text-primary tabular-nums">{count}</span>
        </div>
        <Button
          variant="secondary"
          size="icon"
          onClick={increment}
          className="w-14 h-14 rounded-full text-xl transition-all duration-150 hover:scale-105 active:scale-95 bg-gray-700 hover:bg-gray-600 border-2 border-white text-white"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {showNoteInput && (
        <div className="w-full max-w-xs mb-4 animate-in fade-in slide-in-from-top-2">
          <Input
            placeholder="Add a note (optional)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="rounded-xl"
            autoFocus
          />
        </div>
      )}

      {showLocationPicker && (
        <div className="w-full max-w-xs mb-4 animate-in fade-in slide-in-from-top-2">
          <LocationMap
            mode="picker"
            height="180px"
            initialLocation={location}
            onLocationSelect={(loc) => setLocation(loc)}
          />
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={handleGetCurrentLocation} className="flex-1">
              <MapPin className="w-4 h-4 mr-1" /> Use My Location
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setLocation(undefined); setShowLocationPicker(false); }}>
              Remove
            </Button>
          </div>
        </div>
      )}

      <Button
        onClick={handleAdd}
        className={cn(
          'h-14 px-8 rounded-full text-lg font-semibold transition-all duration-150',
          'bg-gray-700 hover:bg-gray-600 text-white border-2 border-white',
          'hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl mb-4'
        )}
      >
        <Check className="w-5 h-5 mr-2" />
        Add {count} Arrow{count !== 1 ? 's' : ''}
      </Button>

      <div className="flex gap-2 mb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowNoteInput(!showNoteInput)}
          className="text-muted-foreground"
        >
          {showNoteInput ? (
            <>
              <X className="w-4 h-4 mr-1" /> Remove Note
            </>
          ) : (
            '+ Add Note'
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowLocationPicker(!showLocationPicker)}
          className={cn('text-muted-foreground', location && 'text-primary')}
        >
          {showLocationPicker ? (
            <>
              <X className="w-4 h-4 mr-1" /> Hide Map
            </>
          ) : location ? (
            <>
              <MapPin className="w-4 h-4 mr-1" /> Location Set
            </>
          ) : (
            <>
              <MapPin className="w-4 h-4 mr-1" /> Add Location
            </>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mt-6">
        <Button
          variant="outline"
          onClick={onRemoveOne}
          className="rounded-full px-4 transition-all duration-150 hover:scale-105 active:scale-95 bg-gray-700 hover:bg-gray-600 border-2 border-white text-white"
        >
          -1
        </Button>
        <Button
          variant="outline"
          onClick={onAddOne}
          className="rounded-full px-4 transition-all duration-150 hover:scale-105 active:scale-95 bg-gray-700 hover:bg-gray-600 border-2 border-white text-white"
        >
          +1
        </Button>
        {[3, 6, 12, 24].map((amount) => (
          <Button
            key={amount}
            variant="outline"
            onClick={() => quickAdd(amount)}
            className="rounded-full px-4 transition-all duration-150 hover:scale-105 active:scale-95 bg-gray-700 hover:bg-gray-600 border-2 border-white text-white"
          >
            +{amount}
          </Button>
        ))}
      </div>
    </div>
  );
}
