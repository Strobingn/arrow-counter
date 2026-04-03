export interface Location {
  lat: number;
  lng: number;
  name?: string;
}

export interface ArrowSession {
  id: string;
  timestamp: number;
  arrowCount: number;
  date: string;
  note?: string;
  location?: Location;
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
