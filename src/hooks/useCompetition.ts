import { useState, useCallback, useMemo } from 'react';

export type CompetitionFormat = 'nfaa_300' | 'fita_720' | 'vegas' | 'ibo_3d' | 'asa_3d' | 'nfaa_field' | 'indoor_600';

export interface RoundFormat {
  id: CompetitionFormat;
  name: string;
  description: string;
  distances: number[]; // yards
  arrowsPerEnd: number;
  endsPerDistance: number;
  maxScorePerArrow: number;
  scoringRings: string[];
  xRing: boolean;
  unit: 'yards' | 'meters';
}

export const ROUND_FORMATS: Record<CompetitionFormat, RoundFormat> = {
  nfaa_300: {
    id: 'nfaa_300', name: 'NFAA 300 Round', description: '60 arrows at 20 yards on 40cm blue face',
    distances: [20], arrowsPerEnd: 5, endsPerDistance: 12, maxScorePerArrow: 5,
    scoringRings: ['X', '5', '4', '3'], xRing: true, unit: 'yards',
  },
  fita_720: {
    id: 'fita_720', name: 'FITA 720 / Olympic', description: '72 arrows total, 36 at each distance',
    distances: [70, 50], arrowsPerEnd: 6, endsPerDistance: 6, maxScorePerArrow: 10,
    scoringRings: ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1'], xRing: true, unit: 'meters',
  },
  vegas: {
    id: 'vegas', name: 'Vegas Round', description: '30 arrows at 20 yards, X counts for tiebreakers',
    distances: [20], arrowsPerEnd: 3, endsPerDistance: 10, maxScorePerArrow: 10,
    scoringRings: ['X', '10', '9', '8', '7', '6'], xRing: true, unit: 'yards',
  },
  ibo_3d: {
    id: 'ibo_3d', name: 'IBO 3D Round', description: '20 targets, scoring 11-12-14 rings on 3D animals',
    distances: [0], arrowsPerEnd: 1, endsPerDistance: 20, maxScorePerArrow: 11,
    scoringRings: ['14', '12', '11', '10', '8', '5'], xRing: false, unit: 'yards',
  },
  asa_3d: {
    id: 'asa_3d', name: 'ASA 3D Round', description: '20 targets, scoring 12-14 rings on 3D animals',
    distances: [0], arrowsPerEnd: 1, endsPerDistance: 20, maxScorePerArrow: 14,
    scoringRings: ['14', '12', '11', '10', '8', '5'], xRing: false, unit: 'yards',
  },
  nfaa_field: {
    id: 'nfaa_field', name: 'NFAA Field Round', description: '112 arrows at marked distances 20-80 yards',
    distances: [20, 30, 40, 50, 60, 80], arrowsPerEnd: 4, endsPerDistance: 2, maxScorePerArrow: 5,
    scoringRings: ['X', '5', '4', '3'], xRing: true, unit: 'yards',
  },
  indoor_600: {
    id: 'indoor_600', name: 'Indoor 600', description: '60 arrows at 18m on 40cm face, 10-ring scoring',
    distances: [20], arrowsPerEnd: 3, endsPerDistance: 20, maxScorePerArrow: 10,
    scoringRings: ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1'], xRing: true, unit: 'yards',
  },
};

export interface EndScore {
  arrows: (string | null)[];
  distance: number;
  targetNumber: number;
}

export interface CompetitionRound {
  id: string;
  formatId: CompetitionFormat;
  date: string;
  startTime: number;
  endTime?: number;
  ends: EndScore[];
  notes: string;
  bowId?: string;
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).substring(2, 5); }

const STORAGE_KEY = 'arrow-competition-rounds';

function loadRounds(): CompetitionRound[] {
  try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveRounds(r: CompetitionRound[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)); }

export function useCompetition() {
  const [rounds, setRounds] = useState<CompetitionRound[]>(loadRounds);
  const [activeRound, setActiveRound] = useState<CompetitionRound | null>(null);

  const startRound = useCallback((formatId: CompetitionFormat, bowId?: string) => {
    const format = ROUND_FORMATS[formatId];
    const ends: EndScore[] = [];
    let targetNum = 1;
    for (const dist of format.distances) {
      for (let i = 0; i < format.endsPerDistance; i++) {
        ends.push({
          arrows: Array(format.arrowsPerEnd).fill(null),
          distance: dist,
          targetNumber: targetNum++,
        });
      }
    }
    const round: CompetitionRound = {
      id: genId(),
      formatId,
      date: new Date().toISOString().split('T')[0],
      startTime: Date.now(),
      ends,
      notes: '',
      bowId,
    };
    setActiveRound(round);
    return round;
  }, []);

  const scoreArrow = useCallback((endIndex: number, arrowIndex: number, score: string | null) => {
    setActiveRound(prev => {
      if (!prev) return null;
      const next = { ...prev, ends: prev.ends.map((e, ei) =>
        ei === endIndex ? { ...e, arrows: e.arrows.map((a, ai) => ai === arrowIndex ? score : a) } : e
      )};
      return next;
    });
  }, []);

  const finishRound = useCallback(() => {
    setActiveRound(prev => {
      if (!prev) return null;
      const finished = { ...prev, endTime: Date.now() };
      setRounds(r => { const next = [finished, ...r]; saveRounds(next); return next; });
      return null;
    });
  }, []);

  const abandonRound = useCallback(() => {
    setActiveRound(null);
  }, []);

  const deleteRound = useCallback((id: string) => {
    setRounds(prev => { const next = prev.filter(r => r.id !== id); saveRounds(next); return next; });
  }, []);

  const roundStats = useMemo(() => {
    if (!activeRound) return null;
    const format = ROUND_FORMATS[activeRound.formatId];
    let total = 0, xCount = 0, arrowsShot = 0, totalArrows = 0;
    for (const end of activeRound.ends) {
      for (const a of end.arrows) {
        totalArrows++;
        if (a !== null) {
          arrowsShot++;
          if (a === 'X') { total += format.maxScorePerArrow; xCount++; }
          else { total += Number(a) || 0; }
        }
      }
    }
    const maxPossible = format.maxScorePerArrow * totalArrows;
    return { total, xCount, arrowsShot, totalArrows, maxPossible, percentComplete: Math.round((arrowsShot / totalArrows) * 100) };
  }, [activeRound]);

  return {
    rounds,
    activeRound,
    roundStats,
    startRound,
    scoreArrow,
    finishRound,
    abandonRound,
    deleteRound,
  };
}
