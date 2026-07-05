// Pure TS utils for group analysis, stats, simple ML regression, MOA calc, windage
// No external deps for core. Add tfjs for advanced models.

import { ArrowImpact, GroupStats, Point, CalibratedTarget, TrendPrediction, Session } from '../types/archery';

export function calculateDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

export function calculateGroupStats(
  impacts: ArrowImpact[],
  calibrated?: CalibratedTarget
): GroupStats {
  if (impacts.length === 0) {
    return {
      arrowCount: 0,
      center: { x: 0, y: 0 },
      maxRadiusInches: 0,
      meanRadiusInches: 0,
      stdDevRadius: 0,
      diameterMOA: 0,
      groupSize95PercentInches: 0,
      windageBiasInches: 0,
      elevationBiasInches: 0,
      outliers: [],
      qualityScore: 0,
    };
  }

  // 1. Compute center (mean)
  const sumX = impacts.reduce((sum, imp) => sum + imp.point.x, 0);
  const sumY = impacts.reduce((sum, imp) => sum + imp.point.y, 0);
  const center: Point = {
    x: sumX / impacts.length,
    y: sumY / impacts.length,
  };

  // 2. Radii from center
  const radii = impacts.map(imp => calculateDistance(imp.point, center));
  const maxRadius = Math.max(...radii);
  const meanRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
  const variance = radii.reduce((sum, r) => sum + Math.pow(r - meanRadius, 2), 0) / radii.length;
  const stdDev = Math.sqrt(variance);

  // 3. Outliers: > 2.5 std dev (simple statistical)
  const outliers = impacts.filter((imp, i) => {
    const r = radii[i];
    return r > meanRadius + 2.5 * stdDev;
  });

  // 4. 95% containment approx (mean + 2*std or percentile)
  const sortedRadii = [...radii].sort((a, b) => a - b);
  const p95Index = Math.floor(sortedRadii.length * 0.95);
  const groupSize95 = sortedRadii[p95Index] || maxRadius;

  // 5. Real world conversion if calibrated
  let centerReal, maxRInches, meanRInches, group95Inches, windageInches, elevInches;
  let diameterMOA = 0;

  if (calibrated && calibrated.pixelsPerInch > 0) {
    const ppi = calibrated.pixelsPerInch;
    centerReal = {
      xInches: (center.x - calibrated.center.x) / ppi,
      yInches: (center.y - calibrated.center.y) / ppi,
    };
    maxRInches = maxRadius / ppi;
    meanRInches = meanRadius / ppi;
    group95Inches = groupSize95 / ppi;
    windageInches = centerReal.xInches; // lateral
    elevInches = centerReal.yInches;

    // MOA calc: 1 MOA ≈ 1.047 inches at 100 yards. General: sizeMOA = (groupInches / distanceYards) * (180*60 / PI) approx
    // Assume distance known or use 1 MOA = groupInches * 95.5 / distanceYards or standard formula
    // For simplicity, if we have target distance later, but here use rough: assume 20-30yd common
    // Better: user provides distanceYards in session
    diameterMOA = (maxRInches * 2 * 95.5) / (calibrated.diameterInches * 2); // rough, fix with real dist
  } else {
    maxRInches = maxRadius; // pixels fallback
    meanRInches = meanRadius;
    group95Inches = groupSize95;
    windageInches = center.x - (calibrated?.center.x || 0);
    elevInches = center.y - (calibrated?.center.y || 0);
  }

  // Quality score: inverse of spread, normalized 0-100. Tighter groups = higher
  const qualityScore = Math.max(0, Math.min(100, 100 - (meanRInches * 20))); // tune coef

  return {
    arrowCount: impacts.length,
    center,
    centerRealWorld: centerReal,
    maxRadiusInches: maxRInches,
    meanRadiusInches: meanRInches,
    stdDevRadius: stdDev / (calibrated?.pixelsPerInch || 1),
    diameterMOA: Math.max(0.1, diameterMOA || (maxRInches * 1.5)), // fallback
    groupSize95PercentInches: group95Inches,
    windageBiasInches: windageInches,
    elevationBiasInches: elevInches,
    outliers,
    qualityScore: Math.round(qualityScore),
  };
}

// Simple linear regression for trend prediction (ML lite, no tfjs needed for start)
export function linearRegression(data: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

  const sumX = data.reduce((s, d) => s + d.x, 0);
  const sumY = data.reduce((s, d) => s + d.y, 0);
  const sumXY = data.reduce((s, d) => s + d.x * d.y, 0);
  const sumX2 = data.reduce((s, d) => s + d.x * d.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R2
  const yMean = sumY / n;
  const ssTot = data.reduce((s, d) => s + Math.pow(d.y - yMean, 2), 0);
  const ssRes = data.reduce((s, d) => s + Math.pow(d.y - (slope * d.x + intercept), 2), 0);
  const r2 = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

  return { slope, intercept, r2 };
}

export function predictTrend(
  historical: { sessionNum: number; groupMOA: number }[]
): TrendPrediction {
  if (historical.length < 3) {
    return {
      predictedGroupSizeMOA: historical[historical.length - 1]?.groupMOA || 5,
      confidence: 0.3,
      trendSlope: 0,
      recommendation: "Log more sessions for ML prediction. Keep shooting consistent ends.",
    };
  }

  const data = historical.map(h => ({ x: h.sessionNum, y: h.groupMOA }));
  const { slope, intercept, r2 } = linearRegression(data);

  const lastSession = historical[historical.length - 1].sessionNum;
  const predicted = slope * (lastSession + 1) + intercept;
  const confidence = Math.max(0.4, Math.min(0.95, r2));

  let rec = "Trend stable. Focus on form consistency.";
  if (slope < -0.1) rec = `Improving ${Math.abs(slope).toFixed(2)} MOA per session! Keep the routine.`;
  else if (slope > 0.15) rec = `Groups opening up. Check equipment tune, release, or fatigue.`;

  return {
    predictedGroupSizeMOA: Math.max(0.5, predicted),
    confidence: Math.round(confidence * 100) / 100,
    trendSlope: Math.round(slope * 100) / 100,
    recommendation: rec,
  };
}

// Windage / lateral drift analysis
export function analyzeWindageBias(impacts: ArrowImpact[], calibrated?: CalibratedTarget): number {
  if (!impacts.length) return 0;
  const centerX = impacts.reduce((s, i) => s + i.point.x, 0) / impacts.length;
  const refX = calibrated?.center.x || 0;
  const biasPixels = centerX - refX;
  return calibrated ? biasPixels / calibrated.pixelsPerInch : biasPixels;
}

// MOA calculator helper (standard formula)
export function inchesToMOA(inches: number, distanceYards: number): number {
  // 1 MOA = ~1.047" at 100yd. General: MOA = (group_inches / dist_yards) * 95.493
  return (inches / distanceYards) * 95.493;
}

export function MOAToInches(moa: number, distanceYards: number): number {
  return (moa / 95.493) * distanceYards;
}

// Basic heuristic computer vision for arrow hole detection on target photo
// Input: ImageData from canvas. Returns approximate impact points.
// This is the starting point for "auto". Upgrade to tfjs/YOLO later for 95%+ accuracy.
export function detectArrowHolesHeuristic(
  imageData: ImageData,
  targetCenterGuess?: Point,
  sensitivity: number = 40 // threshold adjust
): { points: Point[]; debugInfo: string } {
  const { width, height, data } = imageData;
  const points: Point[] = [];
  const visited = new Set<string>();

  // Simple: scan for dark blobs (arrow holes are darker than target face usually)
  // Convert to grayscale on fly, look for local minima clusters
  const threshold = 80; // dark pixels < this (0-255)

  for (let y = 5; y < height - 5; y += 4) { // stride for speed
    for (let x = 5; x < width - 5; x += 4) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const gray = (r + g + b) / 3;

      if (gray < threshold && !visited.has(`${x},${y}`)) {
        // Found dark pixel, flood fill to find blob center
        const blob = floodFillBlob(data, width, height, x, y, threshold, visited);
        if (blob.size > 8 && blob.size < 400) { // reasonable arrow hole size in px
          const cx = Math.round(blob.sumX / blob.size);
          const cy = Math.round(blob.sumY / blob.size);
          points.push({ x: cx, y: cy });
        }
      }
    }
  }

  // If too many or too few, user can adjust sensitivity or add manual clicks
  let debug = `Heuristic detected ${points.length} potential holes. `;
  if (points.length > 12) debug += "Too many - lower sensitivity or clean target face.";
  if (points.length === 0) debug += "None found - try manual marking or better lighting/contrast photo.";

  // Optional: cluster if multiple groups, but for single group assume all are one
  return { points, debugInfo: debug };
}

function floodFillBlob(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  threshold: number,
  visited: Set<string>
): { size: number; sumX: number; sumY: number } {
  const stack: Point[] = [{ x: startX, y: startY }];
  let size = 0;
  let sumX = 0;
  let sumY = 0;
  const dirs = [[0,1],[1,0],[0,-1],[-1,0]];

  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    const key = `${x},${y}`;
    if (x < 0 || x >= width || y < 0 || y >= height || visited.has(key)) continue;

    const idx = (y * width + x) * 4;
    const gray = (data[idx] + data[idx+1] + data[idx+2]) / 3;
    if (gray >= threshold) continue;

    visited.add(key);
    size++;
    sumX += x;
    sumY += y;

    for (const [dx, dy] of dirs) {
      stack.push({ x: x + dx, y: y + dy });
    }
  }
  return { size, sumX, sumY };
}

// Simple ML stub: you can replace the regression with tfjs model.predict later
export function trainSimpleTrendModel(sessions: Session[]): any {
  // In real: load tfjs, fit sequential model on [sessionNum, distance, env] -> groupMOA
  // For now returns the linear coeffs from util above
  const historical = sessions.map((s, i) => ({
    sessionNum: i,
    groupMOA: s.overallStats.diameterMOA,
  }));
  return linearRegression(historical.map(h => ({ x: h.sessionNum, y: h.groupMOA })));
}