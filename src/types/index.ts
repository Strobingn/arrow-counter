export interface Location {
  lat: number;
  lng: number;
  name?: string;
}

export type ScoreValue = 'X' | '10' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2' | '1' | 'M' | null;

export interface EndScore {
  id: string;
  arrows: ScoreValue[]; // typically 3 or 6 arrows per end
}

export interface BowProfile {
  id: string;
  name: string;
  type: 'compound' | 'recurve' | 'longbow' | 'barebow' | 'traditional' | 'crossbow';
  drawWeight: number; // in lbs
  drawLength?: number; // in inches
  arrowWeight?: number; // in grains
  arrowSpine?: string;
  arrowLength?: number; // in inches
  fletching?: string;
  sightMarks?: Record<string, number>; // distance -> sight setting
  isDefault: boolean;
  notes?: string;
  createdAt: number;
}

export interface EquipmentLog {
  id: string;
  bowId: string;
  type: 'string_change' | 'peep_adjust' | 'rest_adjust' | 'sight_adjust' | 'arrow_build' | 'tune' | 'other';
  description: string;
  timestamp: number;
}

export interface SessionMedia {
  id: string;
  type: 'video' | 'image';
  label: string;
  date: string;
  createdAt: number;
}

export interface ArrowSession {
  id: string;
  timestamp: number;
  arrowCount: number;
  date: string;
  note?: string;
  location?: Location;
  distance?: number; // yards/meters
  distanceUnit?: 'yards' | 'meters';
  bowId?: string; // reference to BowProfile
  weather?: string; // e.g. "Sunny, 10mph wind"
  temperature?: number; // fahrenheit
  endScores?: EndScore[]; // optional score tracking
  groupingQuality?: 'tight' | 'good' | 'loose' | 'scatter'; // self-rated
  media?: SessionMedia[]; // linked media from IndexedDB
}

export interface HistoryItem {
  date: string;
  sessions: ArrowSession[];
  totalArrows: number;
  sessionCount: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string; // lucide icon name
  unlockedAt?: number;
  condition: 'arrows_total' | 'arrows_day' | 'arrows_week' | 'streak_days' | 'sessions_total' | 'score_perfect_end' | 'distance_longest';
  threshold: number;
}

export interface AppState {
  sessions: ArrowSession[];
  bowProfiles: BowProfile[];
  equipmentLogs: EquipmentLog[];
  achievements: Achievement[];
  quickAddPresets: number[];
  settings: {
    soundEnabled: boolean;
    hapticEnabled: boolean;
    distanceUnit: 'yards' | 'meters';
    targetFace: '40cm' | '60cm' | '80cm' | '122cm';
  };
}
