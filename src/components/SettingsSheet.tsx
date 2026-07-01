import { useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { Cloud, CloudOff, Download, Upload, Trash2, Settings, Target, Volume2, Ruler, RotateCcw, X, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface SettingsSheetProps {
  onExport: () => string;
  onImport: (json: string) => boolean;
  onClear: () => void;
  goal?: number;
  onSetGoal?: (goal: number) => void;
  quickAddPresets: number[];
  onUpdatePresets: (presets: number[]) => void;
  settings: { soundEnabled: boolean; hapticEnabled: boolean; distanceUnit: 'yards' | 'meters'; targetFace: string };
  onUpdateSettings: (updates: Partial<{ soundEnabled: boolean; hapticEnabled: boolean; distanceUnit: 'yards' | 'meters'; targetFace: string }>) => void;
}

const CLIENT_ID_KEY = 'arrow-tracker-google-client-id';
const DEFAULT_CLIENT_ID = '1093753205781-3i5bdcuoso4b85r2q0tii8dn4pqe645e.apps.googleusercontent.com';

export function SettingsSheet({ onExport, onImport, onClear, goal, onSetGoal, quickAddPresets, onUpdatePresets, settings, onUpdateSettings }: SettingsSheetProps) {
  const [clientId, setClientId] = useState('');
  const [initialized, setInitialized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localGoal, setLocalGoal] = useState(30);
  const [presets, setPresets] = useState(quickAddPresets);
  const [newPreset, setNewPreset] = useState('');

  useEffect(() => { if (typeof goal === 'number' && goal > 0) setLocalGoal(goal); }, [goal]);
  useEffect(() => { setPresets(quickAddPresets); }, [quickAddPresets]);

  const { isSignedIn, isLoading, lastError, initClient, signIn, signOut, uploadFile, downloadFile } = useGoogleDrive();

  useEffect(() => {
    const saved = localStorage.getItem(CLIENT_ID_KEY) || DEFAULT_CLIENT_ID;
    setClientId(saved);
    if (saved) {
      initClient(saved).then(() => setInitialized(true)).catch(() => setInitialized(true));
    } else { setInitialized(true); }
  }, [initClient]);

  useEffect(() => { if (lastError) toast.error(`Google Drive error: ${lastError}`); }, [lastError]);

  const saveClientId = () => {
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    if (clientId) {
      initClient(clientId).then(() => toast.success('Google Client ID saved')).catch((e) => toast.error(`Failed: ${e.message}`));
    } else { toast.success('Google Client ID cleared'); }
  };

  const handleBackup = async () => { try { await uploadFile(onExport()); toast.success('Backed up to Google Drive'); } catch (e) { toast.error(`Backup failed: ${(e as Error).message}`); } };
  const handleRestore = async () => {
    try { const data = await downloadFile(); const success = onImport(data); success ? toast.success('Restored from Google Drive') : toast.error('Invalid backup data'); } catch (e) { toast.error(`Restore failed: ${(e as Error).message}`); }
  };

  const handleExportFile = () => {
    const data = onExport();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `arrow-tracker-backup-${new Date().toISOString().split('T')[0]}.json`; a.click();
    URL.revokeObjectURL(url); toast.success('Data exported');
  };

  // CSV Export
  const handleExportCSV = () => {
    try {
      const data = JSON.parse(onExport());
      if (!data.sessions?.length) { toast.error('No data to export'); return; }
      const headers = ['Date', 'Time', 'Arrows', 'Bow', 'Distance', 'DistanceUnit', 'Weather', 'TempF', 'Grouping', 'Scores', 'Note'];
      const rows = data.sessions.map((s: Record<string, unknown>) => [
        s.date, new Date(s.timestamp as number).toLocaleTimeString(), s.arrowCount,
        s.bowId || '', s.distance || '', s.distanceUnit || '', s.weather || '', s.temperature || '',
        s.groupingQuality || '', (s.endScores as Array<{ arrows: string[] }>)?.map((e: { arrows: string[] }) => e.arrows.join('/')).join('; ') || '', s.note || '',
      ]);
      const csv = [headers.join(','), ...rows.map((r: string[]) => r.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `arrow-tracker-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url); toast.success('CSV exported');
    } catch { toast.error('Export failed'); }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { onImport(String(reader.result)) ? toast.success('Data imported') : toast.error('Invalid file'); } catch (err) { toast.error(`Import failed: ${(err as Error).message}`); } };
    reader.readAsText(file); e.target.value = '';
  };

  const addPreset = () => {
    const v = parseInt(newPreset, 10);
    if (isNaN(v) || v <= 0) return;
    const next = [...presets, v].filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b).slice(0, 8);
    setPresets(next); onUpdatePresets(next); setNewPreset('');
  };
  const removePreset = (idx: number) => {
    const next = presets.filter((_, i) => i !== idx);
    setPresets(next); onUpdatePresets(next);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full w-10 h-10 transition-all hover:scale-105 active:scale-95">
          <Settings className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Manage your data and preferences</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 py-6">
          {/* Goal */}
          {onSetGoal && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2"><Target className="w-4 h-4" />Daily Goal</h3>
              <div className="flex items-center gap-3">
                <Input type="number" value={localGoal} onChange={(e) => setLocalGoal(isNaN(parseInt(e.target.value)) ? 30 : Math.max(1, Math.min(500, parseInt(e.target.value))))} className="w-24 h-9 text-center rounded-xl" min={1} max={500} />
                <span className="text-sm text-muted-foreground">arrows / day</span>
                <Button size="sm" onClick={() => { onSetGoal(localGoal); toast.success(`Daily goal set to ${localGoal}`); }} className="ml-auto rounded-full">Save</Button>
              </div>
            </div>
          )}

          {/* Sound */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2"><Volume2 className="w-4 h-4" />Sound Effects</h3>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Arrow sound</Label>
              <Switch checked={settings.soundEnabled} onCheckedChange={(v) => onUpdateSettings({ soundEnabled: v })} />
            </div>
          </div>

          {/* Distance Unit */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2"><Ruler className="w-4 h-4" />Distance Unit</h3>
            <Select value={settings.distanceUnit} onValueChange={(v) => onUpdateSettings({ distanceUnit: v as 'yards' | 'meters' })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="yards">Yards</SelectItem><SelectItem value="meters">Meters</SelectItem></SelectContent>
            </Select>
          </div>

          {/* Quick Add Presets */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2"><RotateCcw className="w-4 h-4" />Quick-Add Presets</h3>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-secondary rounded-lg text-xs">
                  +{p} <button onClick={() => removePreset(i)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input type="number" placeholder="Add preset" value={newPreset} onChange={e => setNewPreset(e.target.value)} className="h-8 text-sm" onKeyDown={e => e.key === 'Enter' && addPreset()} />
              <Button size="sm" variant="outline" onClick={addPreset} className="h-8 px-2"><Plus className="w-3.5 h-3.5" /></Button>
            </div>
          </div>

          <Separator />

          {/* Google Drive */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2"><Cloud className="w-4 h-4" />Google Drive Sync</h3>
            <div className="space-y-2">
              <Label className="text-xs">OAuth Client ID</Label>
              <Input placeholder="Your Google OAuth Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} className="text-xs" />
              <p className="text-xs text-muted-foreground">Create a Web OAuth 2.0 Client ID in Google Cloud Console.</p>
              <Button size="sm" variant="outline" onClick={saveClientId} className="w-full">Save Client ID</Button>
            </div>
            {initialized && clientId && (
              <div className="flex flex-col gap-2 pt-2">
                {!isSignedIn ? (
                  <Button size="sm" onClick={signIn} disabled={isLoading}><Cloud className="w-4 h-4 mr-2" />Sign in with Google</Button>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-green-600"><Cloud className="w-4 h-4" /> Signed in</span>
                      <Button size="sm" variant="ghost" onClick={signOut}><CloudOff className="w-4 h-4 mr-1" /> Sign out</Button>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={handleBackup} disabled={isLoading} className="flex-1"><Upload className="w-4 h-4 mr-1" /> Backup</Button>
                      <Button size="sm" variant="outline" onClick={handleRestore} disabled={isLoading} className="flex-1"><Download className="w-4 h-4 mr-1" /> Restore</Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Export/Import */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2"><Download className="w-4 h-4" />Data Export / Import</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleExportFile} className="flex-1"><Download className="w-4 h-4 mr-1" />JSON</Button>
              <Button size="sm" variant="outline" onClick={handleExportCSV} className="flex-1">CSV</Button>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="flex-1"><Upload className="w-4 h-4 mr-1" />Import</Button>
            </div>
            <input ref={fileInputRef} type="file" accept=".json,.csv" className="hidden" onChange={handleImportFile} />
          </div>

          <Separator />

          {/* Danger */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-destructive flex items-center gap-2"><Trash2 className="w-4 h-4" />Danger Zone</h3>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="w-full"><Trash2 className="w-4 h-4 mr-2" />Clear All Data</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently delete all sessions, bows, logs, and achievements. This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onClear}>Clear All</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
