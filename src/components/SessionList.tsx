import { useState } from 'react';
import { Trash2, Edit2, Check, X, MapPin, Crosshair, Thermometer, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { ArrowSession, BowProfile } from '@/types';
import { cn } from '@/lib/utils';
import { LocationMap } from './LocationMap';

interface SessionListProps {
  sessions: ArrowSession[];
  bowProfiles: BowProfile[];
  formatNumber: (num: number) => string;
  onDelete: (id: string) => void;
  onEdit: (id: string, newCount: number, newNote?: string, newLocation?: { lat: number; lng: number }) => void;
}

export function SessionList({ sessions, bowProfiles, formatNumber, onDelete, onEdit }: SessionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCount, setEditCount] = useState(0);
  const [editNote, setEditNote] = useState('');
  const [editLocation, setEditLocation] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [showLocationEdit, setShowLocationEdit] = useState(false);

  const startEdit = (session: ArrowSession) => {
    setEditingId(session.id);
    setEditCount(session.arrowCount);
    setEditNote(session.note || '');
    setEditLocation(session.location);
    setShowLocationEdit(false);
  };

  const saveEdit = () => {
    if (editingId) {
      onEdit(editingId, editCount, editNote || undefined, editLocation);
      setEditingId(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditCount(0);
    setEditNote('');
    setEditLocation(undefined);
    setShowLocationEdit(false);
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const getBowName = (bowId?: string) => bowProfiles.find(b => b.id === bowId)?.name;

  const getGroupLabel = (q?: string) => {
    switch (q) { case 'tight': return 'Tight'; case 'good': return 'Good'; case 'loose': return 'Loose'; case 'scatter': return 'Scatter'; default: return null; }
  };

  if (sessions.length === 0) {
    return (
      <div className="bg-white dark:bg-card rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary mb-4">Today's Sessions</h2>
        <p className="text-sm text-muted-foreground text-center py-4">No arrows recorded today. Start shooting!</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-card rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-primary">Today's Sessions</h2>
        <span className="text-sm text-muted-foreground">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-0">
        {sessions.map((session, index) => (
          <div key={session.id} className={cn('py-3 group transition-colors duration-200', index !== sessions.length - 1 && 'border-b border-border')}>
            {editingId === session.id ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Input type="number" value={editCount} onChange={(e) => setEditCount(parseInt(e.target.value) || 0)} className="w-20 h-9 text-center" min={1} />
                  <span className="text-sm text-muted-foreground">arrows</span>
                  <div className="flex-1" />
                  <Button variant="ghost" size="icon" onClick={saveEdit} className="w-8 h-8 rounded-full hover:bg-success/10 hover:text-success"><Check className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={cancelEdit} className="w-8 h-8 rounded-full hover:bg-destructive/10 hover:text-destructive"><X className="w-4 h-4" /></Button>
                </div>
                <Input placeholder="Note (optional)" value={editNote} onChange={(e) => setEditNote(e.target.value)} className="h-9" />
                {showLocationEdit && (
                  <div className="mt-1">
                    <LocationMap mode="picker" height="120px" initialLocation={editLocation} onLocationSelect={(loc) => setEditLocation(loc)} />
                  </div>
                )}
                <Button size="sm" variant="ghost" onClick={() => setShowLocationEdit(v => !v)} className="self-start">
                  {showLocationEdit ? 'Hide Map' : editLocation ? 'Change Location' : 'Add Location'}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-bold text-primary">{formatNumber(session.arrowCount)} arrows</span>
                    <span className="text-sm text-muted-foreground">at {formatTime(session.timestamp)}</span>
                    {session.location && <MapPin className="w-4 h-4 text-primary shrink-0" />}
                  </div>
                  {/* Meta info */}
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {getBowName(session.bowId) && (
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5"><Crosshair className="w-2.5 h-2.5 mr-0.5" />{getBowName(session.bowId)}</Badge>
                    )}
                    {session.distance && (
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5">{session.distance}{session.distanceUnit === 'meters' ? 'm' : 'yd'}</Badge>
                    )}
                    {getGroupLabel(session.groupingQuality) && (
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{getGroupLabel(session.groupingQuality)}</Badge>
                    )}
                    {session.weather && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Cloud className="w-2.5 h-2.5" />{session.weather}</span>
                    )}
                    {session.temperature !== undefined && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Thermometer className="w-2.5 h-2.5" />{session.temperature}F</span>
                    )}
                  </div>
                  {/* Scores */}
                  {session.endScores && session.endScores.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {session.endScores.map(end => (
                        <span key={end.id} className="text-[10px] bg-primary/10 rounded px-1.5 py-0.5">
                          {end.arrows.reduce((s, a) => s + (a === 'X' ? 10 : a === 'M' ? 0 : Number(a) || 0), 0)}
                        </span>
                      ))}
                    </div>
                  )}
                  {session.note && <span className="text-sm text-muted-foreground mt-0.5">{session.note}</span>}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => startEdit(session)}
                    className="w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-accent/10 hover:text-accent">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(session.id)}
                    className="w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
