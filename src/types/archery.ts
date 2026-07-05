// Core domain types for the baddest arrow counter app
// ML-ready, extensible

export interface Point {
  x: number; // pixels or normalized 0-1
  y: number;
}

export interface CalibratedTarget {
  diameterInches: number; // real world, from manual tap or auto
  center: Point; // pixel coords of target center
  pixelsPerInch: number; // scale from calibration
  imageWidth: number;
  imageHeight: number;
  targetType: '80cm' | '40cm' | '3spot' | 'field' | 'custom';
}

export interface ArrowImpact {
  id: string;
  point: Point; // pixel
  realWorldOffset?: { xInches: number; yInches: number }; // from center, after calibration
  confidence: number; // 0-1 from detection
  isOutlier?: boolean;
  endNumber?: number;
  shotTime?: string; // ISO
  notes?: string;
}

export interface GroupStats {
  arrowCount: number;
  center: Point; // pixel or real
  centerRealWorld?: { xInches: number; yInches: number };
  maxRadiusInches: number;
  meanRadiusInches: number;
  stdDevRadius: number;
  diameterMOA: number; // key metric
  groupSize95PercentInches: number; // 95% containment
  windageBiasInches: number; // positive = right drift
  elevationBiasInches: number;
  outliers: ArrowImpact[];
  qualityScore: number; // 0-100, tighter = higher, ML derived perhaps
}

export interface Session {
  id: string;
  date: string;
  location?: string;
  bowSetup: string; // e.g. "Hoyt RX7 70lb"
  distanceYards: number;
  targetDistanceInches?: number; // for calc
  ends: End[];
  overallStats: GroupStats;
  notes?: string;
  environmental?: {
    windSpeed?: number;
    windDir?: string;
    tempF?: number;
    pressure?: number;
  };
}

export interface End {
  endNumber: number;
  impacts: ArrowImpact[];
  stats: GroupStats;
  time?: string;
}

export interface TrendPrediction {
  predictedGroupSizeMOA: number;
  confidence: number;
  trendSlope: number; // MOA per session, negative = improving
  recommendation: string;
}

export interface SightAdjustment {
  currentClicks: { windage: number; elevation: number };
  recommendedClicks: { windage: number; elevation: number };
  reason: string; // ML or rule based explanation
  expectedGroupShiftMOA: number;
}

export interface MLModelState {
  trendModel?: any; // tfjs model or coefficients
  lastTrained: string;
  dataPoints: number;
}

// For CV / detection
export interface DetectionResult {
  impacts: ArrowImpact[];
  detectedTargetCenter?: Point;
  calibrated?: CalibratedTarget;
  processingTimeMs: number;
  method: 'heuristic' | 'tfjs-yolo' | 'manual';
}