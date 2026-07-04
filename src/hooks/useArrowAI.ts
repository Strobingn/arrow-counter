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

function findColorBlobs(data: Uint8ClampedArray, w: number, h: number): Array<{ x: number; y: number; radius: number; confidence: number }> {
  const blobs: Array<{ x: number; y: number; radius: number; confidence: number }> = [];
  const visited = new Uint8Array(w * h);

  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const idx = (y * w + x) * 4;
      if (visited[y * w + x]) continue;

      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const isFluorescent = (
        (r > 180 && g > 160 && b < 100) ||
        (r > 200 && g > 80 && g < 160 && b < 80) ||
        (r > 200 && g > 160 && b > 120) ||
        (r + g > 350 && b < 120)
      );
      if (!isFluorescent) continue;

      const pixels: Array<{ x: number; y: number }> = [];
      const stack = [{ x, y }];
      while (stack.length > 0 && pixels.length < 500) {
        const p = stack.pop()!;
        const pi = p.y * w + p.x;
        if (visited[pi]) continue;
        visited[pi] = 1;

        const pIdx = pi * 4;
        const pr = data[pIdx], pg = data[pIdx + 1], pb = data[pIdx + 2];
        const pFluor = (pr > 160 && pg > 140 && pb < 120) || (pr + pg > 300 && pb < 130);
        if (!pFluor) continue;

        pixels.push(p);
        if (p.x > 0) stack.push({ x: p.x - 1, y: p.y });
        if (p.x < w - 1) stack.push({ x: p.x + 1, y: p.y });
        if (p.y > 0) stack.push({ x: p.x, y: p.y - 1 });
        if (p.y < h - 1) stack.push({ x: p.x, y: p.y + 1 });
      }

      if (pixels.length < 8 || pixels.length > 400) continue;

      let sumX = 0, sumY = 0;
      for (const p of pixels) { sumX += p.x; sumY += p.y; }
      const bx = sumX / pixels.length;
      const by = sumY / pixels.length;

      let maxR = 0;
      for (const p of pixels) {
        const d = Math.sqrt((p.x - bx) ** 2 + (p.y - by) ** 2);
        if (d > maxR) maxR = d;
      }

      if (bx < 20 || bx > w - 20 || by < 20 || by > h - 20) continue;

      const area = pixels.length;
      const circularity = area / (Math.PI * maxR * maxR + 1);
      const confidence = Math.min(1, (area / 80) * circularity * 1.5);

      if (confidence > 0.2) {
        blobs.push({ x: bx / w, y: by / h, radius: maxR / Math.max(w, h), confidence });
      }
    }
  }
  return blobs;
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
  colorBlobs: Array<{ x: number; y: number; radius: number; confidence: number }>,
  darkBlobs: Array<{ x: number; y: number; radius: number; confidence: number }>,
): DetectedArrow[] {
  const all = [...colorBlobs, ...darkBlobs];
  const merged: DetectedArrow[] = [];
  const used = new Set<number>();

  for (let i = 0; i < all.length; i++) {
    if (used.has(i)) continue;
    let best = all[i];
    used.add(i);

    for (let j = i + 1; j < all.length; j++) {
      if (used.has(j)) continue;
      const d = Math.sqrt((best.x - all[j].x) ** 2 + (best.y - all[j].y) ** 2);
      if (d < 0.04) {
        used.add(j);
        if (all[j].confidence > best.confidence) best = all[j];
      }
    }

    merged.push({ id: generateId(), x: best.x, y: best.y, radius: best.radius, confidence: best.confidence });
  }

  merged.sort((a, b) => b.confidence - a.confidence);
  return merged.slice(0, 12);
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
      img.crossOrigin = 'anonymous';
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

          const colorBlobs = findColorBlobs(data, w, h);
          setProgress(50);

          const darkBlobs = findDarkHoles(data, w, h);
          setProgress(70);

          const merged = mergeDetections(colorBlobs, darkBlobs);
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
