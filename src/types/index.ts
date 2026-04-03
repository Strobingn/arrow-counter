export interface ArrowSession {
  id: string;
  timestamp: number;
  arrowCount: number;
  date: string;
  note?: string;
}

export interface DayStats {
  date: string;
  totalArrows: number;
  sessionCount: number;
  sessions: ArrowSession[];
}

export interface AppState {
  sessions: ArrowSession[];
}
