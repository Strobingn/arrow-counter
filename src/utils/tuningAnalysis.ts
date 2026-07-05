// Advanced tuning analysis utils for walk-back, group shift, bare/fletched, plunger, tiller, spine
// Builds directly on groupAnalysis.ts and archery.ts types
// Pure TS, no deps. Extend with tfjs for advanced simulation later.

import { GroupStats, Point, ArrowImpact, CalibratedTarget } from '../types/archery';
import { calculateDistance, linearRegression } from './groupAnalysis';

export interface WalkbackPoint {
  distanceYards: number;
  verticalInches: number;      // from expected straight line or absolute
  horizontalInches: number;
  groupStats: GroupStats;
  impacts?: ArrowImpact[];
}

export interface TuneDiagnosis {
  issue: string;
  fix: string;
  confidence: number;          // 0-1
  affectedMetric: 'vertical' | 'horizontal' | 'both';
  recommendedAdjustment: {
    nockHeight?: number;       // + up, - down (inches)
    plungerTension?: number;   // turns or pressure units
    tiller?: number;           // mm difference
    drawWeight?: number;
  };
}

export interface TuneSimulationResult {
  newVerticalInches: number;
  newHorizontalInches: number;
  predictedGroupSizeChangeMOA: number;
  confidence: number;
}

// Calculate vertical/horizontal drift rate from walk-back points
export function calculateWalkbackDrift(points: WalkbackPoint[]): {
  verticalDriftPer10yd: number;
  horizontalDriftPer10yd: number;
  verticalR2: number;
  horizontalR2: number;
} {
  if (points.length < 2) return { verticalDriftPer10yd: 0, horizontalDriftPer10yd: 0, verticalR2: 0, horizontalR2: 0 };

  const sorted = [...points].sort((a, b) => a.distanceYards - b.distanceYards);

  const verticalData = sorted.map(p => ({ x: p.distanceYards, y: p.verticalInches }));
  const horizontalData = sorted.map(p => ({ x: p.distanceYards, y: p.horizontalInches }));

  const vReg = linearRegression(verticalData);
  const hReg = linearRegression(horizontalData);

  return {
    verticalDriftPer10yd: vReg.slope * 10,
    horizontalDriftPer10yd: hReg.slope * 10,
    verticalR2: vReg.r2,
    horizontalR2: hReg.r2,
  };
}

// Core walk-back diagnosis engine (the magic)
export function diagnoseWalkbackPattern(points: WalkbackPoint[]): TuneDiagnosis[] {
  if (points.length < 3) {
    return [{
      issue: "Not enough data points",
      fix: "Shoot groups at minimum 3 distances (e.g. 10, 20, 30yd)",
      confidence: 0.3,
      affectedMetric: 'both',
      recommendedAdjustment: {},
    }];
  }

  const drift = calculateWalkbackDrift(points);
  const diagnoses: TuneDiagnosis[] = [];

  // Vertical drift rules (classic archery)
  if (Math.abs(drift.verticalDriftPer10yd) > 0.4) {
    if (drift.verticalDriftPer10yd > 0.6) {
      diagnoses.push({
        issue: "Nock point too LOW or tiller issue",
        fix: "Raise nock point 1/16\" to 1/8\" or check tiller (top limb should be 1/8-1/4\" positive)",
        confidence: Math.min(0.9, 0.6 + drift.verticalR2 * 0.3),
        affectedMetric: 'vertical',
        recommendedAdjustment: { nockHeight: +0.125 },
      });
    } else if (drift.verticalDriftPer10yd < -0.5) {
      diagnoses.push({
        issue: "Nock point too HIGH",
        fix: "Lower nock point 1/16\" to 1/8\"",
        confidence: Math.min(0.88, 0.6 + drift.verticalR2 * 0.3),
        affectedMetric: 'vertical',
        recommendedAdjustment: { nockHeight: -0.125 },
      });
    }
  }

  // Horizontal drift (plunger / clearance / cam timing)
  if (Math.abs(drift.horizontalDriftPer10yd) > 0.35) {
    if (drift.horizontalDriftPer10yd > 0) {
      diagnoses.push({
        issue: "Plunger too stiff or weak side clearance / cam lean",
        fix: "Loosen plunger 1/4 to 1/2 turn or add shims / check cam timing on compound",
        confidence: 0.75 + drift.horizontalR2 * 0.2,
        affectedMetric: 'horizontal',
        recommendedAdjustment: { plungerTension: -0.25 },
      });
    } else {
      diagnoses.push({
        issue: "Plunger too weak or strong side clearance issue",
        fix: "Tighten plunger slightly or check for vane contact",
        confidence: 0.7 + drift.horizontalR2 * 0.2,
        affectedMetric: 'horizontal',
        recommendedAdjustment: { plungerTension: +0.25 },
      });
    }
  }

  if (diagnoses.length === 0) {
    diagnoses.push({
      issue: "Tune looks solid",
      fix: "Groups are tracking straight. Minor tweaks only if chasing last 0.2 MOA.",
      confidence: 0.85,
      affectedMetric: 'both',
      recommendedAdjustment: {},
    });
  }

  return diagnoses;
}

// Simple physics-based simulation of tune change effect on group center
export function simulateTuneAdjustment(
  currentPoint: WalkbackPoint,
  adjustment: { nockHeight?: number; plungerTension?: number; tiller?: number }
): TuneSimulationResult {
  let vShift = 0;
  let hShift = 0;

  if (adjustment.nockHeight) {
    // Rough model: 1/8" nock change ~ 1.5-2.5" vertical shift at 30yd (tune dependent)
    vShift += adjustment.nockHeight * 16; // inches at ~30yd scale
  }
  if (adjustment.plungerTension) {
    hShift += adjustment.plungerTension * -8; // opposite direction usually
  }
  if (adjustment.tiller) {
    vShift += adjustment.tiller * 10;
  }

  // Scale to the actual distance of this point
  const scale = currentPoint.distanceYards / 30;
  const newV = currentPoint.verticalInches + vShift * scale;
  const newH = currentPoint.horizontalInches + hShift * scale;

  // Very rough group size impact (tune change usually tightens or opens groups)
  const sizeChange = Math.abs(vShift) + Math.abs(hShift) > 3 ? 0.4 : -0.2;

  return {
    newVerticalInches: newV,
    newHorizontalInches: newH,
    predictedGroupSizeChangeMOA: sizeChange,
    confidence: 0.65, // simulation confidence
  };
}

// Overall tune quality from walk-back data
export function calculateTuneQualityIndex(points: WalkbackPoint[]): number {
  if (points.length < 2) return 50;
  const drift = calculateWalkbackDrift(points);
  const straightness = (drift.verticalR2 + drift.horizontalR2) / 2;
  const lowDrift = 100 - Math.min(100, (Math.abs(drift.verticalDriftPer10yd) + Math.abs(drift.horizontalDriftPer10yd)) * 25);
  return Math.round(Math.max(30, Math.min(98, straightness * 50 + lowDrift * 0.5)));
}

// Bare shaft vs fletched comparison helper
export function compareBareFletched(
  bare: WalkbackPoint[],
  fletched: WalkbackPoint[]
): { deltaVertical: number; deltaHorizontal: number; recommendation: string } {
  if (!bare.length || !fletched.length) return { deltaVertical: 0, deltaHorizontal: 0, recommendation: "Need both bare and fletched walk-back data" };

  const bareDrift = calculateWalkbackDrift(bare);
  const fletchedDrift = calculateWalkbackDrift(fletched);

  const deltaV = bareDrift.verticalDriftPer10yd - fletchedDrift.verticalDriftPer10yd;
  const deltaH = bareDrift.horizontalDriftPer10yd - fletchedDrift.horizontalDriftPer10yd;

  let rec = "Bare and fletched tracking similarly. Good dynamic spine match.";
  if (Math.abs(deltaV) > 0.8) rec = "Significant vertical divergence — check spine or point weight.";
  if (Math.abs(deltaH) > 0.6) rec = "Horizontal divergence — possible vane contact or clearance issue on fletched arrows.";

  return { deltaVertical: deltaV, deltaHorizontal: deltaH, recommendation: rec };
}