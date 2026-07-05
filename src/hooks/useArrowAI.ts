import { useState, useCallback, useRef } from 'react';

export interface DetectedArrow {
  id: string;
  x: number;
  y: number;
  radius: number;
  confidence: number;
  scoreRing?: string;
}

export interface GroupAnalysis {
  arrows: DetectedArrow[];
  groupCenter: { x: number; y: number };
  maxSpread: number;
  avgSpread: number;
  moa: number;
  outlierArrows: string[];
  scoreEstimate?: { total: number; xCount: number; arrows: number };
}

const TARGET_RINGS: { radius: number; score: string }[] = [
  { radius: 0.019, score: 'X' },
  { radius: 0.038, score: '10' },
  { radius: 0.075, score: '9' },
  { radius: 0.112, score: '8' },
  { radius: 0.150, score: '7' },
  { radius: 0.188, score: '6' },
  { radius: 0.225, score: '5' },
  { radius: 0.263, score: '4' },
  { radius: 0.300, score: '3' },
  { radius: 0.338, score: '2' },
  { radius: 0.375, score: '1' },
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

function radialSymmetryScore(data: Uint8ClampedArray, w: number, h: number, cx: number, cy: number): number {
  let score = 0;
  const radii = [10, 20, 30, 40, 50];
  const angles = 8;
  for (const r of radii) {
    let variance = 0;
    let prevVal = 0;
    for (let a = 0; a < angles; a++) {
      const angle = (a / angles) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(angle) * r);
      const y = Math.round(cy + Math.sin(angle) * r);
      if (x >= 0 && x < w && y >= 0 && y < h) {
        const idx = (y * w + x) * 4;
        const val = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        if (a > 0) variance += Math.abs(val - prevVal);
        prevVal = val;
      }
    }
    score += 255 - variance / angles;
  }
  return score;
}

function findTargetCenter(data: Uint8ClampedArray, w: number, h: number): { x: number; y: number } {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  let bestX = cx, bestY = cy;
  let bestScore = 0;
  const searchRange = Math.min(w, h) * 0.15;
  for (let dy = -searchRange; dy <= searchRange; dy += 4) {
    for (let dx = -searchRange; dx <= searchRange; dx += 4) {
      const x = cx + dx;
      const y = cy + dy;
      const score = radialSymmetryScore(data, w, h, x, y);
      if (score > bestScore) { bestScore = score; bestX = x; bestY = y; }
    }
  }
  return { x: bestX / w, y: bestY / h };
}

// HSV color conversion for better fluorescent nock detection
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return [h, s, v];
}

// Check if pixel is a fluorescent nock color (orange, yellow, green, pink, white)
function isNockColor(r: number, g: number, b: number): boolean {
  const [h, s, v] = rgbToHsv(r, g, b);
  // Bright yellow/orange: H 0.08-0.15, S 0.3+, V 0.7+
  const isYellowOrange = h >= 0.08 && h <= 0.15 && s > 0.3 && v > 0.7;
  // Bright green: H 0.25-0.4, S 0.3+, V 0.6+
  const isGreen = h >= 0.25 && h <= 0.4 && s > 0.3 && v > 0.6;
  // Hot pink/red: H 0.85-1.0 or 0-0.05, S 0.4+, V 0.6+
  const isPinkRed = (h >= 0.85 || h <= 0.05) && s > 0.4 && v > 0.6;
  // White nocks: S < 0.15, V > 0.85
  const isWhite = s < 0.15 && v > 0.85;
  return isYellowOrange || isGreen || isPinkRed || isWhite;
}

// Sub-pixel weighted centroid for maximum accuracy
function subpixelCentroid(pixels: Array<{ x: number; y: number }>, data: Uint8ClampedArray, w: number): { x: number; y: number; brightness: number } {
  let sumWX = 0, sumWY = 0, totalWeight = 0;
  let totalBright = 0;
  for (const p of pixels) {
    const idx = (p.y * w + p.x) * 4;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    const bright = (r + g + b) / 3;
    const weight = bright + 50; // weight brighter pixels more
    sumWX += p.x * weight;
    sumWY += p.y * weight;
    totalWeight += weight;
    totalBright += bright;
  }
  return {
    x: sumWX / totalWeight,
    y: sumWY / totalWeight,
    brightness: totalBright / pixels.length,
  };
}

function findNockBlobs(data: Uint8ClampedArray, w: number, h: number): Array<{ x: number; y: number; radius: number; confidence: number; brightness: number }> {
  const blobs: Array<{ x: number; y: number; radius: number; confidence: number; brightness: number }> = [];
  const visited = new Uint8Array(w * h);

  // Step 1: Find bright nock-colored pixels
  const nockMask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (isNockColor(data[idx], data[idx + 1], data[idx + 2])) {
        nockMask[y * w + x] = 1;
      }
    }
  }

  // Step 2: Dilate mask slightly to connect nearby nock pixels
  const dilated = new Uint8Array(w * h);
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      if (nockMask[y * w + x]) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            dilated[(y + dy) * w + (x + dx)] = 1;
          }
        }
      }
    }
  }

  // Step 3: Connected component analysis with sub-pixel centroids
  for (let y = 4; y < h - 4; y += 2) {
    for (let x = 4; x < w - 4; x += 2) {
      if (!dilated[y * w + x] || visited[y * w + x]) continue;

      const pixels: Array<{ x: number; y: number }> = [];
      const stack = [{ x, y }];
      while (stack.length > 0 && pixels.length < 600) {
        const p = stack.pop()!;
        const pi = p.y * w + p.x;
        if (visited[pi] || !dilated[pi]) continue;
        visited[pi] = 1;
        pixels.push(p);
        if (p.x > 4) stack.push({ x: p.x - 1, y: p.y });
        if (p.x < w - 5) stack.push({ x: p.x + 1, y: p.y });
        if (p.y > 4) stack.push({ x: p.x, y: p.y - 1 });
        if (p.y < h - 5) stack.push({ x: p.x, y: p.y + 1 });
      }

      // Nocks are small: 5-200 pixels depending on image resolution
      if (pixels.length < 5 || pixels.length > 500) continue;

      const centroid = subpixelCentroid(pixels, data, w);
      const bx = centroid.x;
      const by = centroid.y;

      if (bx < 20 || bx > w - 20 || by < 20 || by > h - 20) continue;

      // Calculate radius and circularity
      let maxR = 0;
      for (const p of pixels) {
        const d = Math.sqrt((p.x - bx) ** 2 + (p.y - by) ** 2);
        if (d > maxR) maxR = d;
      }

      const area = pixels.length;
      const circularity = area / (Math.PI * maxR * maxR + 1);

      // Confidence based on: circularity (nocks are round), brightness, size
      const sizeScore = area < 30 ? area / 30 : area > 150 ? 150 / area : 1;
      const confidence = Math.min(1, circularity * sizeScore * 1.2);

      if (confidence > 0.15) {
        blobs.push({ x: bx / w, y: by / h, radius: maxR / Math.max(w, h), confidence, brightness: centroid.brightness });
      }
    }
  }

  // Step 4: Non-maximum suppression - remove duplicates that are too close
  blobs.sort((a, b) => b.confidence - a.confidence);
  const suppressed: typeof blobs = [];
  for (const b of blobs) {
    let tooClose = false;
    for (const s of suppressed) {
      const dx = (b.x - s.x) * w;
      const dy = (b.y - s.y) * h;
      if (Math.sqrt(dx * dx + dy * dy) < 15) { tooClose = true; break; }
    }
    if (!tooClose) suppressed.push(b);
  }

  return suppressed.slice(0, 12);
}

function findDarkHoles(data: Uint8ClampedArray, w: number, h: number): Array<{ x: number; y: number; radius: number; confidence: number }> {
  const blobs: Array<{ x: number; y: number; radius: number; confidence: number }> = [];
  const visited = new Uint8Array(w * h);

  for (let y = 20; y < h - 20; y += 2) {
    for (let x = 20; x < w - 20; x += 2) {
      const idx = (y * w + x) * 4;
      if (visited[y * w + x]) continue;

      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (brightness > 80) continue;

      let localBright = 0;
      let sampleCount = 0;
      for (let dy = -8; dy <= 8; dy += 2) {
        for (let dx = -8; dx <= 8; dx += 2) {
          if (Math.abs(dx) < 3 && Math.abs(dy) < 3) continue;
          const sx = x + dx, sy = y + dy;
          if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
          const sIdx = (sy * w + sx) * 4;
          localBright += (data[sIdx] + data[sIdx + 1] + data[sIdx + 2]) / 3;
          sampleCount++;
        }
      }
      if (sampleCount === 0 || brightness > localBright / sampleCount * 0.5) continue;

      const pixels: Array<{ x: number; y: number }> = [];
      const stack = [{ x, y }];
      while (stack.length > 0 && pixels.length < 300) {
        const p = stack.pop()!;
        const pi = p.y * w + p.x;
        if (visited[pi]) continue;
        visited[pi] = 1;

        const pIdx = pi * 4;
        const pBright = (data[pIdx] + data[pIdx + 1] + data[pIdx + 2]) / 3;
        if (pBright > 100) continue;

        pixels.push(p);
        if (p.x > 0) stack.push({ x: p.x - 1, y: p.y });
        if (p.x < w - 1) stack.push({ x: p.x + 1, y: p.y });
        if (p.y > 0) stack.push({ x: p.x, y: p.y - 1 });
        if (p.y < h - 1) stack.push({ x: p.x, y: p.y + 1 });
      }

      if (pixels.length < 5 || pixels.length > 250) continue;

      let sumX = 0, sumY = 0;
      for (const p of pixels) { sumX += p.x; sumY += p.y; }
      const bx = sumX / pixels.length;
      const by = sumY / pixels.length;

      let maxR = 0;
      for (const p of pixels) {
        const d = Math.sqrt((p.x - bx) ** 2 + (p.y - by) ** 2);
        if (d > maxR) maxR = d;
      }

      const area = pixels.length;
      const circularity = area / (Math.PI * maxR * maxR + 1);
      const confidence = Math.min(1, circularity * 0.8);

      if (confidence > 0.3) {
        blobs.push({ x: bx / w, y: by / h, radius: maxR / Math.max(w, h), confidence });
      }
    }
  }
  return blobs;
}

function mergeDetections(
  nockBlobs: Array<{ x: number; y: number; radius: number; confidence: number; brightness?: number }>,
  darkBlobs: Array<{ x: number; y: number; radius: number; confidence: number }>,
): DetectedArrow[] {
  const merged: DetectedArrow[] = [];
  const usedDark = new Set<number>();

  // For each nock blob, check if there's a nearby dark blob (arrow hole behind nock)
  // If so, boost confidence
  for (const nb of nockBlobs) {
    let bestConf = nb.confidence;
    for (let j = 0; j < darkBlobs.length; j++) {
      if (usedDark.has(j)) continue;
      const d = Math.sqrt((nb.x - darkBlobs[j].x) ** 2 + (nb.y - darkBlobs[j].y) ** 2);
      if (d < 0.03) {
        usedDark.add(j);
        bestConf = Math.min(1, bestConf + 0.2); // boost for dark hole behind nock
      }
    }
    merged.push({ id: generateId(), x: nb.x, y: nb.y, radius: nb.radius, confidence: bestConf });
  }

  // Add remaining dark blobs that weren't matched to nocks
  for (let j = 0; j < darkBlobs.length; j++) {
    if (usedDark.has(j)) continue;
    merged.push({ id: generateId(), x: darkBlobs[j].x, y: darkBlobs[j].y, radius: darkBlobs[j].radius, confidence: darkBlobs[j].confidence * 0.7 });
  }

  // NMS - remove duplicates too close together
  merged.sort((a, b) => b.confidence - a.confidence);
  const result: DetectedArrow[] = [];
  for (const m of merged) {
    let tooClose = false;
    for (const r of result) {
      const d = Math.sqrt((m.x - r.x) ** 2 + (m.y - r.y) ** 2);
      if (d < 0.025) { tooClose = true; break; }
    }
    if (!tooClose) result.push(m);
  }

  return result.slice(0, 12);
}

function scoreArrows(arrows: DetectedArrow[], center: { x: number; y: number }): DetectedArrow[] {
  return arrows.map(a => {
    const d = Math.sqrt((a.x - center.x) ** 2 + (a.y - center.y) ** 2);
    let score = 'M';
    for (const ring of TARGET_RINGS) {
      if (d <= ring.radius) { score = ring.score; break; }
    }
    return { ...a, scoreRing: score };
  });
}

function calculateStats(arrows: DetectedArrow[], center: { x: number; y: number }, imageWidth: number): GroupAnalysis {
  if (arrows.length === 0) {
    return { arrows: [], groupCenter: center, maxSpread: 0, avgSpread: 0, moa: 0, outlierArrows: [] };
  }

  const gc = {
    x: arrows.reduce((s, a) => s + a.x, 0) / arrows.length,
    y: arrows.reduce((s, a) => s + a.y, 0) / arrows.length,
  };

  const distances = arrows.map(a => ({ id: a.id, dist: Math.sqrt((a.x - gc.x) ** 2 + (a.y - gc.y) ** 2) }));

  let maxSpread = 0;
  for (let i = 0; i < arrows.length; i++) {
    for (let j = i + 1; j < arrows.length; j++) {
      const d = Math.sqrt((arrows[i].x - arrows[j].x) ** 2 + (arrows[i].y - arrows[j].y) ** 2);
      if (d > maxSpread) maxSpread = d;
    }
  }

  const avgDist = distances.reduce((s, d) => s + d.dist, 0) / distances.length;
  const outliers = distances.filter(d => d.dist > avgDist * 1.8).map(d => d.id);

  const targetDiameterInches = 15.7;
  const pixelsPerInch = (imageWidth * 0.75) / targetDiameterInches;
  const maxSpreadInches = maxSpread * imageWidth / pixelsPerInch;
  const avgSpreadInches = avgDist * imageWidth / pixelsPerInch;

  const distanceYards = 20;
  const moa = (maxSpreadInches / distanceYards) * 100 / 1.047;

  const scoreMap: Record<string, number> = { X: 10, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2, '1': 1, M: 0 };
  let total = 0, xCount = 0;
  for (const a of arrows) {
    const s = scoreMap[a.scoreRing || 'M'] || 0;
    total += s;
    if (a.scoreRing === 'X') xCount++;
  }

  return {
    arrows,
    groupCenter: gc,
    maxSpread: Math.round(maxSpreadInches * 100) / 100,
    avgSpread: Math.round(avgSpreadInches * 100) / 100,
    moa: Math.round(moa * 100) / 100,
    outlierArrows: outliers,
    scoreEstimate: { total, xCount, arrows: arrows.length },
  };
}

export function useArrowAI() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const detectArrows = useCallback(async (imageSrc: string): Promise<GroupAnalysis> => {
    setIsAnalyzing(true);
    setProgress(0);

    return new Promise((resolve, reject) => {
      const img = new Image();
      // Only set crossOrigin for external HTTP(S) URLs, not file:// or data: URLs
      if (imageSrc.startsWith('http')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;
          const maxDim = 800;
          let w = img.width, h = img.height;
          if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
          else if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          setProgress(10);

          const imageData = ctx.getImageData(0, 0, w, h);
          const data = imageData.data;

          const center = findTargetCenter(data, w, h);
          setProgress(25);

          const nockBlobs = findNockBlobs(data, w, h);
          setProgress(50);

          const darkBlobs = findDarkHoles(data, w, h);
          setProgress(70);

          const merged = mergeDetections(nockBlobs, darkBlobs);
          setProgress(85);

          const scored = scoreArrows(merged, center);
          setProgress(95);

          const result = calculateStats(scored, center, w);
          setProgress(100);

          canvasRef.current = canvas;
          setIsAnalyzing(false);
          resolve(result);
        } catch (e) {
          setIsAnalyzing(false);
          reject(e);
        }
      };
      img.onerror = () => { setIsAnalyzing(false); reject(new Error('Failed to load image')); };
      img.src = imageSrc;
    });
  }, []);

  return { detectArrows, isAnalyzing, progress, canvasRef };
}

export function addManualArrow(analysis: GroupAnalysis, x: number, y: number, imageWidth: number): GroupAnalysis {
  const newArrow: DetectedArrow = { id: generateId(), x, y, radius: 0.015, confidence: 1.0 };
  return calculateStats([...analysis.arrows, newArrow], analysis.groupCenter, imageWidth);
}

export function removeArrow(analysis: GroupAnalysis, arrowId: string, imageWidth: number): GroupAnalysis {
  return calculateStats(analysis.arrows.filter(a => a.id !== arrowId), analysis.groupCenter, imageWidth);
}
