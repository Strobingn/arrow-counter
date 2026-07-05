import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { ArrowCounter } from '@/components/ArrowCounter';
import { SessionList } from '@/components/SessionList';
import { Stats } from '@/components/Stats';
import { History } from '@/components/History';

import { SettingsSheet } from '@/components/SettingsSheet';
import { EquipmentSheet } from '@/components/EquipmentSheet';
import { Charts } from '@/components/Charts';
import { AchievementPanel } from '@/components/AchievementPanel';
import { ArrowAIAnalyzer } from '@/components/ArrowAIAnalyzer';
import { TuningTools } from '@/components/TuningTools';
import { CompetitionMode } from '@/components/CompetitionMode';
import { VideoShotAnalysis } from '@/components/VideoShotAnalysis';
import { useCompetition } from '@/hooks/useCompetition';
import { useArrows } from '@/hooks/useArrows';
import { useAudio } from '@/hooks/useAudio';
import { Target } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import './App.css';

const GOAL_STORAGE_KEY = 'arrow-tracker-goal';
const DEFAULT_GOAL = 30;

function App() {
  const {
    todaySessions, todayTotal, weekTotal, monthTotal, allTimeTotal,
    bestDay, averagePerSession, currentStreak, longestStreak,
    history, bowProfiles, defaultBow, equipmentLogs,
    achievements, quickAddPresets, settings, canUndo, canRedo,
    addArrows, addOneArrow, removeOneArrow, deleteSession, editSession,
    undo, redo, addBowProfile, updateBowProfile, deleteBowProfile,
    addEquipmentLog, deleteEquipmentLog, updateQuickAddPresets, updateSettings,
    exportData, importData, clearAllData, formatNumber,
  } = useArrows();

  const { playThwack, playAchievement, playGoal } = useAudio();
  const [isLoaded, setIsLoaded] = useState(false);

  // Track newly unlocked achievements
  const [prevUnlockedCount, setPrevUnlockedCount] = useState(0);
  useEffect(() => {
    const current = achievements.filter(a => a.unlockedAt).length;
    if (current > prevUnlockedCount && prevUnlockedCount > 0) {
      const newlyUnlocked = achievements.filter(a => a.unlockedAt && prevUnlockedCount === 0 ? true :
        !achievements.slice(0, prevUnlockedCount).find(pa => pa.id === a.id && pa.unlockedAt));
      if (newlyUnlocked.length > 0) {
        const a = newlyUnlocked[0];
        if (settings.soundEnabled) playAchievement();
        toast.success(`Achievement unlocked: ${a.title}!`, { duration: 4000 });
      }
    }
    setPrevUnlockedCount(current);
  }, [achievements, prevUnlockedCount, playAchievement, settings.soundEnabled]);

  // Daily goal
  const [goal, setGoalState] = useState<number>(DEFAULT_GOAL);
  useEffect(() => {
    const stored = localStorage.getItem(GOAL_STORAGE_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed > 0) { setGoalState(parsed); return; }
    }
    localStorage.setItem(GOAL_STORAGE_KEY, String(DEFAULT_GOAL));
  }, []);

  const setGoal = (newGoal: number) => {
    const clamped = Math.max(1, Math.min(500, Math.floor(newGoal || DEFAULT_GOAL)));
    setGoalState(clamped);
    localStorage.setItem(GOAL_STORAGE_KEY, String(clamped));
  };

  // Target distance for AI analyzer
  const [aiTargetDistance, setAiTargetDistance] = useState(20);

  // Competition

  useEffect(() => { setIsLoaded(true); }, []);

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" richColors />
      <Header
        actions={
          <>
            <EquipmentSheet
              bowProfiles={bowProfiles}
              equipmentLogs={equipmentLogs}
              onAddBow={addBowProfile}
              onUpdateBow={updateBowProfile}
              onDeleteBow={deleteBowProfile}
              onAddLog={addEquipmentLog}
              onDeleteLog={deleteEquipmentLog}
            />
            <SettingsSheet
              onExport={exportData}
              onImport={importData}
              onClear={clearAllData}
              goal={goal}
              onSetGoal={setGoal}
              quickAddPresets={quickAddPresets}
              onUpdatePresets={updateQuickAddPresets}
              settings={settings}
              onUpdateSettings={updateSettings}
            />
          </>
        }
      />

      <main className={`pt-14 pb-8 px-4 transition-all duration-500 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* Arrow Counter */}
        <section className="max-w-md mx-auto">
          <ArrowCounter
            todayTotal={todayTotal}
            goal={goal}
            onSetGoal={setGoal}
            onAdd={addArrows}
            onAddOne={addOneArrow}
            onRemoveOne={removeOneArrow}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            formatNumber={formatNumber}
            bowProfiles={bowProfiles}
            defaultBow={defaultBow}
            quickAddPresets={quickAddPresets}
            playThwack={playThwack}
            playGoal={playGoal}
            soundEnabled={settings.soundEnabled}
          />
        </section>

        {/* Tabs */}
        <section className="max-w-md mx-auto mt-4">
          <Tabs defaultValue="today" className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-4">
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="stats">Stats</TabsTrigger>
              <TabsTrigger value="comp">Compete</TabsTrigger>
              <TabsTrigger value="ai">AI & Tools</TabsTrigger>
              <TabsTrigger value="video">Video</TabsTrigger>
            </TabsList>

            <TabsContent value="today" className="space-y-4">
              <SessionList
                sessions={todaySessions}
                bowProfiles={bowProfiles}
                formatNumber={formatNumber}
                onDelete={deleteSession}
                onEdit={editSession}
              />
            </TabsContent>

            <TabsContent value="stats" className="space-y-4">
              <Stats
                todayTotal={todayTotal}
                weekTotal={weekTotal}
                monthTotal={monthTotal}
                allTimeTotal={allTimeTotal}
                bestDay={bestDay}
                averagePerSession={averagePerSession}
                currentStreak={currentStreak}
                longestStreak={longestStreak}
                formatNumber={formatNumber}
              />
              <Charts sessions={[...history.flatMap(h => h.sessions)]} formatNumber={formatNumber} />
              <AchievementPanel
                achievements={achievements}
                totalArrows={allTimeTotal}
                todayArrows={todayTotal}
                streak={currentStreak}
                sessions={[...history.flatMap(h => h.sessions)].length}
              />
            </TabsContent>

            <TabsContent value="comp" className="space-y-4">
              <CompetitionMode bowProfiles={bowProfiles} />
            </TabsContent>

            <TabsContent value="ai" className="space-y-4">
              <div className="bg-white dark:bg-card rounded-2xl p-3 shadow-sm flex items-center gap-3">
                <Target className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm">Target distance:</span>
                <input type="range" min={5} max={100} step={5} value={aiTargetDistance}
                  onChange={e => setAiTargetDistance(Number(e.target.value))} className="flex-1 accent-primary" />
                <span className="text-sm font-bold w-12 text-right">{aiTargetDistance}yd</span>
              </div>
              <ArrowAIAnalyzer targetDistance={aiTargetDistance} />
              <TuningTools sessions={todaySessions} />
            </TabsContent>

            <TabsContent value="video" className="space-y-4">
              <VideoShotAnalysis bowProfiles={bowProfiles} />
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <History history={history} formatNumber={formatNumber} />
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  );
}

export default App;
