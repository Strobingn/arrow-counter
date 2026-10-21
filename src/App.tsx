import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BarChart3, Crosshair, LayoutDashboard, Target, Wrench } from 'lucide-react';
import { Header } from '@/components/Header';
import { Dashboard } from '@/components/Dashboard';
import { ArrowCounter } from '@/components/ArrowCounter';
import { SessionList } from '@/components/SessionList';
import { Stats } from '@/components/Stats';
import { History } from '@/components/History';
import { SettingsSheet } from '@/components/SettingsSheet';
import { EquipmentSheet } from '@/components/EquipmentSheet';
import { Charts } from '@/components/Charts';
import { AchievementPanel } from '@/components/AchievementPanel';
import { useArrows } from '@/hooks/useArrows';
import { useAudio } from '@/hooks/useAudio';
import { useMediaStore } from '@/hooks/useMediaStorage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import './App.css';

const ArrowAIAnalyzer = lazy(() => import('@/components/ArrowAIAnalyzer').then(module => ({ default: module.ArrowAIAnalyzer })));
const TuningTools = lazy(() => import('@/components/TuningTools').then(module => ({ default: module.TuningTools })));
const CompetitionMode = lazy(() => import('@/components/CompetitionMode').then(module => ({ default: module.CompetitionMode })));
const VideoShotAnalysis = lazy(() => import('@/components/VideoShotAnalysis').then(module => ({ default: module.VideoShotAnalysis })));
const SessionMediaGallery = lazy(() => import('@/components/SessionMediaGallery').then(module => ({ default: module.SessionMediaGallery })));
const GOAL_STORAGE_KEY = 'arrow-tracker-goal';
const DEFAULT_GOAL = 30;

function App() {
  const {
    sessions, todaySessions, todayTotal, weekTotal, monthTotal, allTimeTotal,
    bestDay, averagePerSession, currentStreak, longestStreak,
    history, bowProfiles, defaultBow, equipmentLogs,
    achievements, quickAddPresets, settings, canUndo, canRedo,
    addArrows, addOneArrow, removeOneArrow, deleteSession, editSession,
    undo, redo, addBowProfile, updateBowProfile, deleteBowProfile,
    addEquipmentLog, deleteEquipmentLog, updateQuickAddPresets, updateSettings,
    exportData, importData, clearAllData, formatNumber,
    attachMediaToSession, detachMediaFromSession,
  } = useArrows();
  const { playThwack, playAchievement, playGoal } = useAudio();
  const { media: mediaStore, addMedia: addMediaStore, removeMedia } = useMediaStore();
  const [tab, setTab] = useState('overview');
  const [aiTargetDistance, setAiTargetDistance] = useState(20);
  const [goal, setGoalState] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(GOAL_STORAGE_KEY));
      return Number.isFinite(stored) && stored > 0 ? Math.min(500, Math.floor(stored)) : DEFAULT_GOAL;
    } catch { return DEFAULT_GOAL; }
  });
  const prevUnlockedRef = useRef(new Set(achievements.filter(achievement => achievement.unlockedAt).map(achievement => achievement.id)));
  useEffect(() => {
    for (const achievement of achievements) {
      if (achievement.unlockedAt && !prevUnlockedRef.current.has(achievement.id)) {
        if (settings.soundEnabled) playAchievement();
        toast.success(`Achievement unlocked: ${achievement.title}!`);
      }
    }
    prevUnlockedRef.current = new Set(achievements.filter(achievement => achievement.unlockedAt).map(achievement => achievement.id));
  }, [achievements, playAchievement, settings.soundEnabled]);
  const setGoal = (value: number) => {
    const next = Math.max(1, Math.min(500, Math.floor(value || DEFAULT_GOAL)));
    setGoalState(next);
    try { localStorage.setItem(GOAL_STORAGE_KEY, String(next)); }
    catch { toast.error('The goal changed, but could not be saved on this device.'); }
  };
  const navigate = (value: string) => { setTab(value); window.scrollTo({ top: 0, behavior: 'instant' }); };

  return <div className="app-shell">
    <Toaster position="top-center" />
    <Header actions={<>
      <EquipmentSheet bowProfiles={bowProfiles} equipmentLogs={equipmentLogs} onAddBow={addBowProfile} onUpdateBow={updateBowProfile} onDeleteBow={deleteBowProfile} onAddLog={addEquipmentLog} onDeleteLog={deleteEquipmentLog} />
      <SettingsSheet onExport={exportData} onImport={importData} onClear={clearAllData} goal={goal} onSetGoal={setGoal} quickAddPresets={quickAddPresets} onUpdatePresets={updateQuickAddPresets} settings={settings} onUpdateSettings={updateSettings} />
    </>} />
    <Tabs value={tab} onValueChange={navigate} className="app-tabs">
      <TabsList className="main-navigation" aria-label="Main navigation">
        <TabsTrigger value="overview"><LayoutDashboard size={19} /><span>Overview</span></TabsTrigger>
        <TabsTrigger value="shoot"><Crosshair size={21} /><span>Shoot</span></TabsTrigger>
        <TabsTrigger value="insights"><BarChart3 size={20} /><span>Insights</span></TabsTrigger>
        <TabsTrigger value="tools"><Wrench size={19} /><span>Toolkit</span></TabsTrigger>
      </TabsList>
      <main className="app-main">
        <TabsContent value="overview" className="page-content">
          <Dashboard sessions={sessions} bowProfiles={bowProfiles} defaultBow={defaultBow} todayTotal={todayTotal} goal={goal} currentStreak={currentStreak} allTimeTotal={allTimeTotal} formatNumber={formatNumber} onShoot={() => navigate('shoot')} onInsights={() => navigate('insights')} />
        </TabsContent>
        <TabsContent value="shoot" forceMount className="page-content data-[state=inactive]:hidden">
          <div className="page-heading"><div><p className="eyebrow">One end at a time</p><h1>On the shooting line.</h1></div></div>
          <div className="shoot-layout">
            <section className="chart-panel counter-panel">
              <ArrowCounter todayTotal={todayTotal} goal={goal} onSetGoal={setGoal} onAdd={addArrows} onAddOne={addOneArrow} onRemoveOne={removeOneArrow} onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} formatNumber={formatNumber} bowProfiles={bowProfiles} defaultBow={defaultBow} quickAddPresets={quickAddPresets} playThwack={playThwack} playGoal={playGoal} soundEnabled={settings.soundEnabled} />
            </section>
            <div className="space-y-5"><SessionList sessions={todaySessions} bowProfiles={bowProfiles} formatNumber={formatNumber} onDelete={deleteSession} onEdit={editSession} /><div className="range-tip"><Target size={20} /><div><strong>Make the next chart more useful.</strong><p>Add your bow, distance, group rating, and end scores before saving a session.</p></div></div></div>
          </div>
        </TabsContent>
        <TabsContent value="insights" className="page-content space-y-5">
          <div className="page-heading"><div><p className="eyebrow">See the work adding up</p><h1>Your shooting, in focus.</h1></div></div>
          <Charts sessions={sessions} bowProfiles={bowProfiles} goal={goal} formatNumber={formatNumber} />
          <details className="chart-panel records-panel"><summary>Personal records & achievements</summary><div className="records-grid"><Stats todayTotal={todayTotal} weekTotal={weekTotal} monthTotal={monthTotal} allTimeTotal={allTimeTotal} bestDay={bestDay} averagePerSession={averagePerSession} currentStreak={currentStreak} longestStreak={longestStreak} formatNumber={formatNumber} /><AchievementPanel achievements={achievements} totalArrows={allTimeTotal} todayArrows={todayTotal} streak={currentStreak} sessions={sessions.length} /></div></details>
          <History history={history} formatNumber={formatNumber} />
        </TabsContent>
        <TabsContent value="tools" className="page-content space-y-5">
          <div className="page-heading"><div><p className="eyebrow">Your range companion</p><h1>The right tools. Right here.</h1></div></div>
          <Tabs defaultValue="tuning">
            <TabsList className="tool-navigation" aria-label="Training tools"><TabsTrigger value="tuning">AI & tuning</TabsTrigger><TabsTrigger value="comp">Compete</TabsTrigger><TabsTrigger value="video">Video</TabsTrigger><TabsTrigger value="media">Media</TabsTrigger></TabsList>
            <Suspense fallback={<div className="chart-panel p-8" role="status">Opening your tools…</div>}>
              <TabsContent value="tuning" className="tools-content space-y-5">
                <label className="distance-control"><Target size={18} /><span>Target distance</span><input aria-label="AI target distance in yards" type="range" min={5} max={100} step={5} value={aiTargetDistance} onChange={event => setAiTargetDistance(Number(event.target.value))} /><strong>{aiTargetDistance} yd</strong></label>
                <ArrowAIAnalyzer targetDistance={aiTargetDistance} sessions={sessions} addMedia={addMediaStore} attachMediaToSession={attachMediaToSession} />
                <TuningTools sessions={todaySessions} />
              </TabsContent>
              <TabsContent value="comp" className="tools-content"><CompetitionMode bowProfiles={bowProfiles} /></TabsContent>
              <TabsContent value="video" className="tools-content"><VideoShotAnalysis sessions={sessions} onAttachMedia={attachMediaToSession} addMedia={addMediaStore} /></TabsContent>
              <TabsContent value="media" className="tools-content"><SessionMediaGallery sessions={sessions} mediaStore={mediaStore} onAttachMedia={attachMediaToSession} onDetachMedia={detachMediaFromSession} onDeleteMedia={removeMedia} /></TabsContent>
            </Suspense>
          </Tabs>
        </TabsContent>
      </main>
    </Tabs>
  </div>;
}

export default App;
