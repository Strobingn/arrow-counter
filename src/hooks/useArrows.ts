import { useState, useEffect, useCallback } from 'react';
import type { ArrowSession } from '@/types';

const STORAGE_KEY = 'arrow-tracker-data';

export function useArrows() {
  const [sessions, setSessions] = useState<ArrowSession[]>([]);
  const [quickAddValue, setQuickAddValue] = useState<string>('');

  // Load sessions from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSessions(parsed.sessions || []);
      } catch (e) {
        console.error('Failed to parse stored data:', e);
      }
    }
  }, []);

  // Save to localStorage whenever sessions change
  useEffect(() => {
    const data = { sessions };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [sessions]);

  const addArrows = useCallback((count: number, note?: string) => {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    
    const newSession: ArrowSession = {
      id: `session-${now}`,
      timestamp: now,
      arrowCount: count,
      date: today,
      note,
    };
    
    setSessions((prev) => [newSession, ...prev]);
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }, []);

  const editSession = useCallback((sessionId: string, newCount: number, newNote?: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, arrowCount: newCount, note: newNote } : s
      )
    );
  }, []);

  const addOneArrow = useCallback(() => {
    addArrows(1);
  }, [addArrows]);

  const removeOneArrow = useCallback(() => {
    if (sessions.length === 0) return;

    const mostRecent = sessions.reduce((latest, s) =>
      s.timestamp > latest.timestamp ? s : latest
    );

    if (mostRecent.arrowCount <= 1) {
      deleteSession(mostRecent.id);
    } else {
      editSession(mostRecent.id, mostRecent.arrowCount - 1, mostRecent.note);
    }
  }, [sessions, deleteSession, editSession]);

  // Get today's sessions
  const todaySessions = sessions.filter(
    (s) => s.date === new Date().toISOString().split('T')[0]
  );

  // Calculate today's total
  const todayTotal = todaySessions.reduce((sum, s) => sum + s.arrowCount, 0);

  // Calculate this week's total
  const getWeekTotal = () => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    return sessions
      .filter((s) => s.timestamp >= weekStart.getTime())
      .reduce((sum, s) => sum + s.arrowCount, 0);
  };

  // Calculate this month's total
  const getMonthTotal = () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    return sessions
      .filter((s) => s.timestamp >= monthStart.getTime())
      .reduce((sum, s) => sum + s.arrowCount, 0);
  };

  // Get all-time total
  const allTimeTotal = sessions.reduce((sum, s) => sum + s.arrowCount, 0);

  // Get best day
  const getBestDay = () => {
    const dayMap = new Map<string, number>();
    
    sessions.forEach((s) => {
      const current = dayMap.get(s.date) || 0;
      dayMap.set(s.date, current + s.arrowCount);
    });
    
    let bestDate = '';
    let bestCount = 0;
    
    dayMap.forEach((count, date) => {
      if (count > bestCount) {
        bestCount = count;
        bestDate = date;
      }
    });
    
    return { date: bestDate, count: bestCount };
  };

  // Get average per session
  const getAveragePerSession = () => {
    if (sessions.length === 0) return 0;
    return Math.round(allTimeTotal / sessions.length);
  };

  // Get history grouped by date
  const getHistory = () => {
    const grouped = new Map<string, ArrowSession[]>();
    
    sessions.forEach((s) => {
      const existing = grouped.get(s.date) || [];
      existing.push(s);
      grouped.set(s.date, existing);
    });
    
    return Array.from(grouped.entries())
      .map(([date, daySessions]) => ({
        date,
        sessions: daySessions.sort((a, b) => b.timestamp - a.timestamp),
        totalArrows: daySessions.reduce((sum, s) => sum + s.arrowCount, 0),
        sessionCount: daySessions.length,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  };

  // Format number with commas
  const formatNumber = useCallback((num: number): string => {
    return num.toLocaleString();
  }, []);

  return {
    sessions,
    todaySessions,
    todayTotal,
    weekTotal: getWeekTotal(),
    monthTotal: getMonthTotal(),
    allTimeTotal,
    bestDay: getBestDay(),
    averagePerSession: getAveragePerSession(),
    history: getHistory(),
    quickAddValue,
    setQuickAddValue,
    addArrows,
    addOneArrow,
    removeOneArrow,
    deleteSession,
    editSession,
    formatNumber,
  };
}
