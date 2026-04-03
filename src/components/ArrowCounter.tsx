import { useState } from 'react';
import { Plus, Minus, Check, X, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { LocationMap } from './LocationMap';
import { Geolocation } from '@capacitor/geolocation';
import type { Location } from '@/types';

interface ArrowCounterProps {
  todayTotal: number;
  onAdd: (count: number, note?: string, location?: Location) => void;
  onAddOne: () => void;
  onRemoveOne: () => void;
  formatNumber: (num: number) => string;
}

export function ArrowCounter({ todayTotal, onAdd, onAddOne, onRemoveOne, formatNumber }: ArrowCounterProps) {
  const [count, setCount] = useState(6);
  const [note, setNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [location, setLocation] = useState<Location | undefined>(undefined);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

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

  return (
    <div className="flex flex-col items-center py-6">
      {/* Today's Total Display */}
      <div className="text-center mb-6">
        <p className="text-sm text-muted-foreground mb-1">Today's Arrows</p>
        <div className="text-6xl font-bold text-primary tabular-nums">
          {formatNumber(todayTotal)}
        </div>
      </div>

      {/* Counter Controls */}
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

      {/* Note Input */}
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

      {/* Location Picker */}
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

      {/* Add Button */}
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

      {/* Toggles */}
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

      {/* Quick Add/Remove Buttons */}
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
