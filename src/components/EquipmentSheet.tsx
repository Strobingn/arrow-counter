import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Crosshair, Plus, Trash2, Wrench, Star } from 'lucide-react';
import type { BowProfile, EquipmentLog } from '@/types';
import { toast } from 'sonner';

interface EquipmentSheetProps {
  bowProfiles: BowProfile[];
  equipmentLogs: EquipmentLog[];
  onAddBow: (bow: Omit<BowProfile, 'id' | 'createdAt'>) => string;
  onUpdateBow: (id: string, updates: Partial<BowProfile>) => void;
  onDeleteBow: (id: string) => void;
  onAddLog: (log: Omit<EquipmentLog, 'id'>) => void;
  onDeleteLog: (id: string) => void;
}

const BOW_TYPES = ['compound', 'recurve', 'longbow', 'barebow', 'traditional', 'crossbow'] as const;
const LOG_TYPES = [
  { value: 'string_change', label: 'String/Cable Change' },
  { value: 'peep_adjust', label: 'Peep Sight Adjust' },
  { value: 'rest_adjust', label: 'Rest Adjust' },
  { value: 'sight_adjust', label: 'Sight Adjust' },
  { value: 'arrow_build', label: 'Arrow Build' },
  { value: 'tune', label: 'Tuning Session' },
  { value: 'other', label: 'Other' },
] as const;

export function EquipmentSheet({ bowProfiles, equipmentLogs, onAddBow, onUpdateBow, onDeleteBow, onAddLog, onDeleteLog }: EquipmentSheetProps) {
  const [showAddBow, setShowAddBow] = useState(false);
  const [newBow, setNewBow] = useState({ name: '', type: 'compound' as BowProfile['type'], drawWeight: 60, drawLength: 28, arrowWeight: 400, arrowSpine: '340', arrowLength: 28, fletching: 'Blazer Vanes', notes: '', isDefault: false });
  const [logBowId, setLogBowId] = useState('');
  const [logType, setLogType] = useState<EquipmentLog['type']>('other');
  const [logDesc, setLogDesc] = useState('');

  const handleAddBow = () => {
    if (!newBow.name.trim()) { toast.error('Bow name is required'); return; }
    onAddBow({ ...newBow, isDefault: bowProfiles.length === 0 ? true : newBow.isDefault });
    setNewBow({ name: '', type: 'compound', drawWeight: 60, drawLength: 28, arrowWeight: 400, arrowSpine: '340', arrowLength: 28, fletching: 'Blazer Vanes', notes: '', isDefault: false });
    setShowAddBow(false);
    toast.success('Bow profile added');
  };

  const handleAddLog = () => {
    if (!logBowId || !logDesc.trim()) { toast.error('Select a bow and enter a description'); return; }
    onAddLog({ bowId: logBowId, type: logType, description: logDesc, timestamp: Date.now() });
    setLogDesc('');
    toast.success('Maintenance log added');
  };

  const sortedLogs = [...equipmentLogs].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full w-10 h-10 transition-all hover:scale-105 active:scale-95">
          <Crosshair className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Equipment</SheetTitle>
          <SheetDescription>Manage bows and maintenance logs</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="bows" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bows">Bows</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          </TabsList>

          <TabsContent value="bows" className="space-y-4 mt-4">
            {bowProfiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Crosshair className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No bows yet. Add your first!
              </div>
            ) : (
              <div className="space-y-2">
                {bowProfiles.map(bow => (
                  <div key={bow.id} className="border rounded-xl p-3 relative">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{bow.name}</span>
                          {bow.isDefault && <Badge variant="secondary" className="text-[10px]"><Star className="w-3 h-3 mr-0.5" />Default</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground capitalize">{bow.type} &bull; {bow.drawWeight}lbs</p>
                        {bow.arrowSpine && <p className="text-xs text-muted-foreground">Spine {bow.arrowSpine} &bull; {bow.arrowWeight}gr</p>}
                      </div>
                      <div className="flex gap-1">
                        {!bow.isDefault && (
                          <Button size="sm" variant="ghost" onClick={() => onUpdateBow(bow.id, { isDefault: true })} className="h-8 w-8 p-0">
                            <Star className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => { onDeleteBow(bow.id); toast.success('Bow deleted'); }} className="h-8 w-8 p-0 text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showAddBow ? (
              <div className="border rounded-xl p-3 space-y-3">
                <h4 className="text-sm font-medium">Add New Bow</h4>
                <Input placeholder="Bow name" value={newBow.name} onChange={e => setNewBow({ ...newBow, name: e.target.value })} />
                <Select value={newBow.type} onValueChange={(v) => setNewBow({ ...newBow, type: v as BowProfile['type'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BOW_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Draw Weight (lbs)</Label><Input type="number" value={newBow.drawWeight} onChange={e => setNewBow({ ...newBow, drawWeight: Number(e.target.value) })} /></div>
                  <div><Label className="text-xs">Draw Length (in)</Label><Input type="number" value={newBow.drawLength} onChange={e => setNewBow({ ...newBow, drawLength: Number(e.target.value) })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Arrow Weight (gr)</Label><Input type="number" value={newBow.arrowWeight} onChange={e => setNewBow({ ...newBow, arrowWeight: Number(e.target.value) })} /></div>
                  <div><Label className="text-xs">Arrow Spine</Label><Input value={newBow.arrowSpine} onChange={e => setNewBow({ ...newBow, arrowSpine: e.target.value })} /></div>
                </div>
                <Input placeholder="Notes (optional)" value={newBow.notes} onChange={e => setNewBow({ ...newBow, notes: e.target.value })} />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowAddBow(false)}>Cancel</Button>
                  <Button size="sm" className="flex-1" onClick={handleAddBow}><Plus className="w-4 h-4 mr-1" />Add Bow</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setShowAddBow(true)}><Plus className="w-4 h-4 mr-1" />Add Bow Profile</Button>
            )}
          </TabsContent>

          <TabsContent value="maintenance" className="space-y-4 mt-4">
            {bowProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Add a bow first to log maintenance.</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Select value={logBowId} onValueChange={setLogBowId}>
                    <SelectTrigger><SelectValue placeholder="Select bow" /></SelectTrigger>
                    <SelectContent>{bowProfiles.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={logType} onValueChange={(v) => setLogType(v as EquipmentLog['type'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LOG_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input placeholder="Description..." value={logDesc} onChange={e => setLogDesc(e.target.value)} />
                  <Button size="sm" className="w-full" onClick={handleAddLog}><Wrench className="w-4 h-4 mr-1" />Log Entry</Button>
                </div>
                <Separator />
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sortedLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No maintenance logs yet.</p>
                  ) : (
                    sortedLogs.map(log => {
                      const bow = bowProfiles.find(b => b.id === log.bowId);
                      return (
                        <div key={log.id} className="text-sm border rounded-lg p-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{LOG_TYPES.find(t => t.value === log.type)?.label}</span>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onDeleteLog(log.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                          </div>
                          <p className="text-muted-foreground">{log.description}</p>
                          <p className="text-xs text-muted-foreground">{bow?.name} &bull; {new Date(log.timestamp).toLocaleDateString()}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
