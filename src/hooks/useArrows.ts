import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ArrowSession, BowProfile, EquipmentLog, Achievement, Location } from '@/types';

const STORAGE_KEY = 'arrow-tracker-data';
const BOWS_KEY = 'arrow-tracker-bows';
const LOGS_KEY = 'arrow-tracker-logs';
const ACHIEVEMENTS_KEY = 'arrow-tracker-achievements';
const PRESETS_KEY = 'arrow-tracker-presets';
const SETTINGS_KEY = 'arrow-tracker-settings';

const DEFAULT_PRESETS = [1, 3, 6, 12, 24];

const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  { id: 'first_arrow', title: 'First Shot', description: 'Log your first arrow', icon: 'Target', condition: 'arrows_total', threshold: 1 },
  { id: 'century', title: 'Century Club', description: 'Shoot 100 arrows total', icon: 'Crosshair', condition: 'arrows_total', threshold: 100 },
  { id: 'five_hundred', title: '500 Club', description: 'Shoot 500 arrows total', icon: 'Flame', condition: 'arrows_total', threshold: 500 },
  { id: 'thousand', title: '1K Archer', description: 'Shoot 1,000 arrows total', icon: 'Trophy', condition: 'arrows_total', threshold: 1000 },
  { id: 'two_five_hundred', title: 'Iron Archer', description: 'Shoot 2,500 arrows total', icon: 'Crown', condition: 'arrows_total', threshold: 2500 },
  { id: 'five_k', title: '5K Legend', description: 'Shoot 5,000 arrows total', icon: 'Star', condition: 'arrows_total', threshold: 5000 },
  { id: 'hundred_day', title: 'Century Day', description: 'Shoot 100 arrows in one day', icon: 'Zap', condition: 'arrows_day', threshold: 100 },
  { id: 'two_hundred_day', title: '200 Day', description: 'Shoot 200 arrows in one day', icon: 'Flame', condition: 'arrows_day', threshold: 200 },
  { id: 'three_day_streak', title: '3-Day Streak', description: 'Shoot arrows 3 days in a row', icon: 'Calendar', condition: 'streak_days', threshold: 3 },
  { id: 'week_streak', title: 'Week Warrior', description: 'Shoot arrows 7 days in a row', icon: 'CalendarCheck', condition: 'streak_days', threshold: 7 },
  { id: 'month_streak', title: 'Month Master', description: 'Shoot arrows 30 days in a row', icon: 'Award', condition: 'streak_days', threshold: 30 },
  { id: 'ten_sessions', title: 'Getting Started', description: 'Complete 10 shooting sessions', icon: 'Timer', condition: 'sessions_total', threshold: 10 },
  { id: 'fifty_sessions', title: 'Regular', description: 'Complete 50 shooting sessions', icon: 'Repeat', condition: 'sessions_total', threshold: 50 },
  { id: 'hundred_sessions', title: 'Dedicated', description: 'Complete 100 shooting sessions', icon: 'Medal', condition: 'sessions_total', threshold: 100 },
  { id: 'perfect_end', title: 'Perfect End', description: 'Score all Xs in an end', icon: 'Target', condition: 'score_perfect_end', threshold: 1 },
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored) as T;
  } catch { /* ignore */ }
  return fallback;
}

function saveJSON(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* ignore */ }
}

export function useArrows() {
  const [sessions, setSessions] = useState<ArrowSession[]>(() => loadJSON<ArrowSession[]>(STORAGE_KEY, []));
  const [bowProfiles, setBowProfiles] = useState<BowProfile[]>(() => loadJSON<BowProfile[]>(BOWS_KEY, []));
  const [equipmentLogs, setEquipmentLogs] = useState<EquipmentLog[]>(() => loadJSON<EquipmentLog[]>(LOGS_KEY, []));
  const [achievements, setAchievements] = useState<Achievement[]>(() => loadJSON<Achievement[]>(ACHIEVEMENTS_KEY, DEFAULT_ACHIEVEMENTS.map(a => ({ ...a }))));
  const [quickAddPresets, setQuickAddPresets] = useState<number[]>(() => loadJSON<number[]>(PRESETS_KEY, DEFAULT_PRESETS));
  const [settings, setSettings] = useState<{ soundEnabled: boolean; hapticEnabled: boolean; distanceUnit: 'yards' | 'meters'; targetFace: string }>(
    () => loadJSON(SETTINGS_KEY, { soundEnabled: true, hapticEnabled: true, distanceUnit: 'yards', targetFace: '40cm' })
  );
  const [undoStack, setUndoStack] = useState<ArrowSession[][]>([]);
  const [redoStack, setRedoStack] = useState<ArrowSession[][]>([]);

  // Persist sessions
  useEffect(() => { saveJSON(STORAGE_KEY, sessions); }, [sessions]);
  useEffect(() => { saveJSON(BOWS_KEY, bowProfiles); }, [bowProfiles]);
  useEffect(() => { saveJSON(LOGS_KEY, equipmentLogs); }, [equipmentLogs]);
  useEffect(() => { saveJSON(ACHIEVEMENTS_KEY, achievements); }, [achievements]);
  useEffect(() => { saveJSON(PRESETS_KEY, quickAddPresets); }, [quickAddPresets]);
  useEffect(() => { saveJSON(SETTINGS_KEY, settings); }, [settings]);

  // ---- Computed ----
  const todayDate = getTodayDate();

  const todaySessions = useMemo(() =>
    sessions.filter(s => s.date === todayDate).sort((a, b) => b.timestamp - a.timestamp),
    [sessions, todayDate]
  );

  const todayTotal = useMemo(() => todaySessions.reduce((sum, s) => sum + s.arrowCount, 0), [todaySessions]);

  const weekTotal = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - dayOfWeek);
    sunday.setHours(0, 0, 0, 0);
    return sessions.filter(s => s.timestamp >= sunday.getTime()).reduce((sum, s) => sum + s.arrowCount, 0);
  }, [sessions]);

  const monthTotal = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return sessions.filter(s => s.timestamp >= monthStart.getTime()).reduce((sum, s) => sum + s.arrowCount, 0);
  }, [sessions]);

  const allTimeTotal = useMemo(() => sessions.reduce((sum, s) => sum + s.arrowCount, 0), [sessions]);

  const averagePerSession = useMemo(() => {
    if (sessions.length === 0) return 0;
    return Math.round(allTimeTotal / sessions.length);
  }, [sessions, allTimeTotal]);

  const bestDay = useMemo(() => {
    const dayMap = new Map<string, number>();
    sessions.forEach(s => {
      dayMap.set(s.date, (dayMap.get(s.date) || 0) + s.arrowCount);
    });
    let bestDate = '';
    let bestCount = 0;
    dayMap.forEach((count, date) => {
      if (count > bestCount) { bestCount = count; bestDate = date; }
    });
    return { date: bestDate, count: bestCount };
  }, [sessions]);

  const currentStreak = useMemo(() => {
    if (sessions.length === 0) return 0;
    const dateSet = new Set(sessions.map(s => s.date));
    const today = new Date();
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (dateSet.has(dateStr)) {
        streak++;
      } else if (i === 0) {
        continue; // today hasn't happened yet, check yesterday
      } else {
        break;
      }
    }
    return streak;
  }, [sessions]);

  const longestStreak = useMemo(() => {
    if (sessions.length === 0) return 0;
    const dateSet = new Set(sessions.map(s => s.date));
    const sortedDates = Array.from(dateSet).sort();
    let maxStreak = 0;
    let current = 0;
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) { current = 1; }
      else {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (diff === 1) { current++; }
        else { current = 1; }
      }
      maxStreak = Math.max(maxStreak, current);
    }
    return maxStreak;
  }, [sessions]);

  const history = useMemo(() => {
    const dayMap = new Map<string, ArrowSession[]>();
    [...sessions].sort((a, b) => b.timestamp - a.timestamp).forEach(s => {
      const existing = dayMap.get(s.date) || [];
      existing.push(s);
      dayMap.set(s.date, existing);
    });
    return Array.from(dayMap.entries()).map(([date, sess]) => ({
      date,
      sessions: sess.sort((a, b) => b.timestamp - a.timestamp),
      totalArrows: sess.reduce((sum, s) => sum + s.arrowCount, 0),
      sessionCount: sess.length,
    }));
  }, [sessions]);

  const locatedSessions = useMemo(() => sessions.filter(s => s.location), [sessions]);

  const defaultBow = useMemo(() => bowProfiles.find(b => b.isDefault) || bowProfiles[0], [bowProfiles]);

  // ---- Achievement checking ----
  const checkAchievements = useCallback((sessionList: ArrowSession[], todaySess: ArrowSession[]) => {
    const todayCount = todaySess.reduce((sum, s) => sum + s.arrowCount, 0);
    const totalCount = sessionList.reduce((sum, s) => sum + s.arrowCount, 0);
    const sessCount = sessionList.length;
    const streak = (() => {
      const dateSet = new Set(sessionList.map(s => s.date));
      const today = new Date();
      let s = 0;
      for (let i = 0; i < 365; i++) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        if (dateSet.has(d.toISOString().split('T')[0])) s++;
        else if (i > 0) break;
      }
      return s;
    })();

    setAchievements(prev => prev.map(a => {
      if (a.unlockedAt) return a;
      let unlocked = false;
      switch (a.condition) {
        case 'arrows_total': unlocked = totalCount >= a.threshold; break;
        case 'arrows_day': unlocked = todayCount >= a.threshold; break;
        case 'arrows_week': break; // computed separately
        case 'streak_days': unlocked = streak >= a.threshold; break;
        case 'sessions_total': unlocked = sessCount >= a.threshold; break;
        case 'score_perfect_end':
          unlocked = sessionList.some(s => s.endScores?.some(e => e.arrows.length > 0 && e.arrows.every(sc => sc === 'X')));
          break;
      }
      if (unlocked) return { ...a, unlockedAt: Date.now() };
      return a;
    }));
  }, []);

  // ---- Actions ----
  const pushUndo = useCallback((newSessions: ArrowSession[]) => {
    setUndoStack(prev => [...prev.slice(-19), newSessions]);
    setRedoStack([]);
  }, []);

  const addArrows = useCallback((count: number, note?: string, location?: Location, opts?: { bowId?: string; distance?: number; distanceUnit?: 'yards' | 'meters'; weather?: string; temperature?: number; endScores?: ArrowSession['endScores']; groupingQuality?: ArrowSession['groupingQuality'] }) => {
    if (count <= 0) return;
    const newSession: ArrowSession = {
      id: generateId(),
      timestamp: Date.now(),
      arrowCount: count,
      date: getTodayDate(),
      note,
      location,
      ...opts,
    };
    setSessions(prev => {
      const next = [...prev, newSession];
      pushUndo(next);
      return next;
    });
  }, [pushUndo]);

  const addOneArrow = useCallback(() => {
    addArrows(1);
  }, [addArrows]);

  const removeOneArrow = useCallback(() => {
    setSessions(prev => {
      const today = getTodayDate();
      const lastTodayIdx = [...prev].reverse().findIndex(s => s.date === today);
      if (lastTodayIdx === -1) return prev;
      const actualIdx = prev.length - 1 - lastTodayIdx;
      const session = prev[actualIdx];
      if (session.arrowCount > 1) {
        const next = prev.map((s, i) => i === actualIdx ? { ...s, arrowCount: s.arrowCount - 1 } : s);
        pushUndo(next);
        return next;
      }
      const next = prev.filter((_, i) => i !== actualIdx);
      pushUndo(next);
      return next;
    });
  }, [pushUndo]);

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      pushUndo(next);
      return next;
    });
  }, [pushUndo]);

  const editSession = useCallback((id: string, newCount: number, newNote?: string, newLocation?: { lat: number; lng: number }) => {
    setSessions(prev => {
      const next = prev.map(s => s.id === id ? { ...s, arrowCount: newCount, note: newNote, location: newLocation } : s);
      pushUndo(next);
      return next;
    });
  }, [pushUndo]);

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length < 2) return prev;
      const previous = prev[prev.length - 2];
      setRedoStack(r => [...r, prev[prev.length - 1]]);
      setSessions(previous);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setUndoStack(u => [...u, next]);
      setSessions(next);
      return prev.slice(0, -1);
    });
  }, []);

  const canUndo = undoStack.length > 1;
  const canRedo = redoStack.length > 0;

  // ---- Bow Profiles ----
  const addBowProfile = useCallback((bow: Omit<BowProfile, 'id' | 'createdAt'>) => {
    const newBow: BowProfile = { ...bow, id: generateId(), createdAt: Date.now() };
    setBowProfiles(prev => {
      const wasEmpty = prev.length === 0;
      const next = [...prev, newBow];
      if (wasEmpty || newBow.isDefault) {
        return next.map(b => b.id === newBow.id ? { ...b, isDefault: true } : { ...b, isDefault: false });
      }
      return next;
    });
    return newBow.id;
  }, []);

  const updateBowProfile = useCallback((id: string, updates: Partial<BowProfile>) => {
    setBowProfiles(prev => {
      const next = prev.map(b => b.id === id ? { ...b, ...updates } : b);
      if (updates.isDefault) {
        return next.map(b => ({ ...b, isDefault: b.id === id }));
      }
      return next;
    });
  }, []);

  const deleteBowProfile = useCallback((id: string) => {
    setBowProfiles(prev => {
      const filtered = prev.filter(b => b.id !== id);
      if (filtered.length > 0 && !filtered.some(b => b.isDefault)) {
        filtered[0] = { ...filtered[0], isDefault: true };
      }
      return filtered;
    });
    setSessions(prev => prev.map(s => s.bowId === id ? { ...s, bowId: undefined } : s));
  }, []);

  // ---- Equipment Logs ----
  const addEquipmentLog = useCallback((log: Omit<EquipmentLog, 'id'>) => {
    setEquipmentLogs(prev => [...prev, { ...log, id: generateId() }]);
  }, []);

  const deleteEquipmentLog = useCallback((id: string) => {
    setEquipmentLogs(prev => prev.filter(l => l.id !== id));
  }, []);

  // ---- Presets ----
  const updateQuickAddPresets = useCallback((presets: number[]) => {
    setQuickAddPresets(presets.filter(p => p > 0).slice(0, 8));
  }, []);

  // ---- Settings ----
  const updateSettings = useCallback((updates: Partial<typeof settings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, [settings]);

  // ---- Import/Export ----
  const exportData = useCallback(() => {
    return JSON.stringify({
      version: 2,
      sessions,
      bowProfiles,
      equipmentLogs,
      achievements,
      quickAddPresets,
      settings,
      exportedAt: Date.now(),
    }, null, 2);
  }, [sessions, bowProfiles, equipmentLogs, achievements, quickAddPresets, settings]);

  const importData = useCallback((json: string) => {
    try {
      const data = JSON.parse(json);
      if (data.sessions && Array.isArray(data.sessions)) {
        setSessions(data.sessions);
        pushUndo(data.sessions);
      }
      if (data.bowProfiles) setBowProfiles(data.bowProfiles);
      if (data.equipmentLogs) setEquipmentLogs(data.equipmentLogs);
      if (data.achievements) setAchievements(data.achievements);
      if (data.quickAddPresets) setQuickAddPresets(data.quickAddPresets);
      if (data.settings) setSettings(data.settings);
      return true;
    } catch {
      // Try v1 format
      try {
        const v1 = JSON.parse(json);
        if (v1.sessions && Array.isArray(v1.sessions)) {
          setSessions(v1.sessions);
          pushUndo(v1.sessions);
          return true;
        }
      } catch { /* ignore */ }
      return false;
    }
  }, [pushUndo]);

  const clearAllData = useCallback(() => {
    setSessions([]);
    setBowProfiles([]);
    setEquipmentLogs([]);
    setAchievements(DEFAULT_ACHIEVEMENTS.map(a => ({ ...a })));
    setQuickAddPresets(DEFAULT_PRESETS);
    setUndoStack([]);
    setRedoStack([]);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(BOWS_KEY);
    localStorage.removeItem(LOGS_KEY);
    localStorage.removeItem(ACHIEVEMENTS_KEY);
    localStorage.removeItem(PRESETS_KEY);
  }, []);

  const formatNumber = useCallback((num: number) => {
    return num.toLocaleString('en-US');
  }, []);

  // Check achievements whenever sessions change
  useEffect(() => {
    checkAchievements(sessions, todaySessions);
  }, [sessions, todaySessions, checkAchievements]);

  // Initialize undo stack
  useEffect(() => {
    if (undoStack.length === 0 && sessions.length > 0) {
      setUndoStack([sessions]);
    }
  }, []); // eslint-disable-line

  return {
    sessions,
    todaySessions,
    todayTotal,
    weekTotal,
    monthTotal,
    allTimeTotal,
    bestDay,
    averagePerSession,
    currentStreak,
    longestStreak,
    history,
    locatedSessions,
    bowProfiles,
    defaultBow,
    equipmentLogs,
    achievements,
    unlockedAchievements: achievements.filter(a => a.unlockedAt),
    lockedAchievements: achievements.filter(a => !a.unlockedAt),
    quickAddPresets,
    settings,
    canUndo,
    canRedo,
    addArrows,
    addOneArrow,
    removeOneArrow,
    deleteSession,
    editSession,
    undo,
    redo,
    addBowProfile,
    updateBowProfile,
    deleteBowProfile,
    addEquipmentLog,
    deleteEquipmentLog,
    updateQuickAddPresets,
    updateSettings,
    exportData,
    importData,
    clearAllData,
    formatNumber,
  };
}
