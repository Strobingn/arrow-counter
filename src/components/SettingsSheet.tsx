import { useEffect, useRef, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { Cloud, CloudOff, Download, Upload, Trash2, Settings, Target } from 'lucide-react';
import { toast } from 'sonner';

interface SettingsSheetProps {
  onExport: () => string;
  onImport: (json: string) => boolean;
  onClear: () => void;
  goal?: number;
  onSetGoal?: (goal: number) => void;
}

const CLIENT_ID_KEY = 'arrow-tracker-google-client-id';
const DEFAULT_CLIENT_ID = '1093753205781-3i5bdcuoso4b85r2q0tii8dn4pqe645e.apps.googleusercontent.com';

export function SettingsSheet({ onExport, onImport, onClear, goal, onSetGoal }: SettingsSheetProps) {
  const [clientId, setClientId] = useState('');
  const [initialized, setInitialized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local state for daily goal compact editor in settings (synced from prop)
  const [localGoal, setLocalGoal] = useState(30);

  useEffect(() => {
    if (typeof goal === 'number' && goal > 0) {
      setLocalGoal(goal);
    }
  }, [goal]);

  const {
    isSignedIn,
    isLoading,
    lastError,
    initClient,
    signIn,
    signOut,
    uploadFile,
    downloadFile,
  } = useGoogleDrive();

  useEffect(() => {
    const saved = localStorage.getItem(CLIENT_ID_KEY) || DEFAULT_CLIENT_ID;
    setClientId(saved);
    if (saved) {
      initClient(saved)
        .then(() => setInitialized(true))
        .catch(() => setInitialized(true));
    } else {
      setInitialized(true);
    }
  }, [initClient]);

  useEffect(() => {
    if (lastError) {
      toast.error(`Google Drive error: ${lastError}`);
    }
  }, [lastError]);

  // Sync goal input from prop (from App state / localStorage)
  useEffect(() => {
    if (goal !== undefined) {
      setGoalInput(goal);
    }
  }, [goal]);

  const saveClientId = () => {
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    if (clientId) {
      initClient(clientId)
        .then(() => toast.success('Google Client ID saved'))
        .catch((e) => toast.error(`Failed to initialize: ${e.message}`));
    } else {
      toast.success('Google Client ID cleared');
    }
  };

  const handleBackup = async () => {
    try {
      const data = onExport();
      await uploadFile(data);
      toast.success('Backed up to Google Drive');
    } catch (e) {
      toast.error(`Backup failed: ${(e as Error).message}`);
    }
  };

  const handleRestore = async () => {
    try {
      const data = await downloadFile();
      const success = onImport(data);
      if (success) {
        toast.success('Restored from Google Drive');
      } else {
        toast.error('Invalid backup data');
      }
    } catch (e) {
      toast.error(`Restore failed: ${(e as Error).message}`);
    }
  };

  const handleExportFile = () => {
    const data = onExport();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arrow-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Data exported');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const success = onImport(String(reader.result));
        if (success) {
          toast.success('Data imported');
        } else {
          toast.error('Invalid file format');
        }
      } catch (err) {
        toast.error(`Import failed: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full w-10 h-10 transition-all duration-150 hover:scale-105 active:scale-95"
        >
          <Settings className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Manage your data and preferences</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 py-6">
          {/* Daily Goal - compact edit control inside Settings (alternative discoverable non-intrusive UX) */}
          {onSetGoal && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Target className="w-4 h-4" />
                Daily Goal
              </h3>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={localGoal}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setLocalGoal(isNaN(v) ? 30 : Math.max(1, Math.min(500, v)));
                  }}
                  className="w-24 h-9 text-center rounded-xl"
                  min={1}
                  max={500}
                />
                <span className="text-sm text-muted-foreground">arrows / day</span>
                <Button
                  size="sm"
                  onClick={() => {
                    onSetGoal(localGoal);
                    toast.success(`Daily goal set to ${localGoal}`);
                  }}
                  className="ml-auto rounded-full"
                >
                  Save
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Also tap the progress ring on the main screen to edit.</p>
            </div>
          )}

          {/* Google Drive Sync */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Cloud className="w-4 h-4" />
              Google Drive Sync
            </h3>
            <div className="space-y-2">
              <Label htmlFor="client-id" className="text-xs">
                OAuth Client ID
              </Label>
              <Input
                id="client-id"
                placeholder="Your Google OAuth Client ID"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Create a Web OAuth 2.0 Client ID in Google Cloud Console.
              </p>
              <Button size="sm" variant="outline" onClick={saveClientId} className="w-full">
                Save Client ID
              </Button>
            </div>

            {initialized && clientId && (
              <div className="flex flex-col gap-2 pt-2">
                {!isSignedIn ? (
                  <Button size="sm" onClick={signIn} disabled={isLoading}>
                    <Cloud className="w-4 h-4 mr-2" />
                    Sign in with Google
                  </Button>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-green-600">
                        <Cloud className="w-4 h-4" /> Signed in
                      </span>
                      <Button size="sm" variant="ghost" onClick={signOut}>
                        <CloudOff className="w-4 h-4 mr-1" /> Sign out
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleBackup}
                        disabled={isLoading}
                        className="flex-1"
                      >
                        <Upload className="w-4 h-4 mr-1" /> Backup
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRestore}
                        disabled={isLoading}
                        className="flex-1"
                      >
                        <Download className="w-4 h-4 mr-1" /> Restore
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Manual Export / Import */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Download className="w-4 h-4" />
              Data Export / Import
            </h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleExportFile} className="flex-1">
                <Download className="w-4 h-4 mr-1" /> Export
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1"
              >
                <Upload className="w-4 h-4 mr-1" /> Import
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>

          <Separator />

          {/* Clear Data */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-destructive flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Danger Zone
            </h3>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="w-full">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all your sessions and statistics. This action cannot
                    be undone.
                  </AlertDialogDescription>
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
