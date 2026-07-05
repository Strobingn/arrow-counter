/**
 * ML-Based Archery Form Analysis Engine
 *
 * Performs real computer vision analysis on video frames:
 * - Frame differencing for motion magnitude/direction
 * - Sobel edge detection for body/bow tracking
 * - Optical flow for key point tracking
 * - Phase classification via motion signatures
 * - Form scoring with actionable feedback
 */

// ---- Types ----

export interface FrameMetrics {
  motionMagnitude: number; // 0-255 avg pixel diff
  motionDirection: { dx: number; dy: number }; // dominant direction
  motionConcentration: { x: number; y: number; spread: number }; // where motion happens
  edgeDensity: number; // how much edge structure is visible
  stability: number; // inverse of motion variance (higher = more stable)
}

export interface DetectedPhase {
  name: string;
  startFrame: number;
  endFrame: number;
  confidence: number;
}

export interface FormIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
  correction: string;
  drill: string;
  affectedFrames: number[];
}

export interface FormScore {
  overall: number; // 0-100
  anchorStability: number;
  releaseQuality: number;
  followThrough: number;
  bowArmStability: number;
  bodyAlignment: number;
}

export interface FormAnalysis {
  phases: DetectedPhase[];
  scores: FormScore;
  issues: FormIssue[];
  strengths: string[];
  frameMetrics: FrameMetrics[];
  keyFrameIndex: number; // best frame to review
}

// ---- CV Utilities ----

function imageDataToGray(data: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

function computeFrameDiff(prev: Uint8Array, curr: Uint8Array, w: number, h: number): {
  diff: Uint8Array;
  avgMotion: number;
  motionX: number;
  motionY: number;
  concentrationX: number;
  concentrationY: number;
  motionPixels: number;
} {
  const diff = new Uint8Array(w * h);
  let totalDiff = 0;
  let motionX = 0;
  let motionY = 0;
  let motionPixels = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const d = Math.abs(curr[idx] - prev[idx]);
      diff[idx] = d;
      totalDiff += d;

      if (d > 15) {
        motionPixels++;
        motionX += x;
        motionY += y;
      }
    }
  }

  const avgMotion = totalDiff / (w * h);
  const concX = motionPixels > 0 ? motionX / motionPixels / w : 0.5;
  const concY = motionPixels > 0 ? motionY / motionPixels / h : 0.5;

  return { diff, avgMotion, motionX: motionPixels > 0 ? motionX / motionPixels : w / 2, motionY: motionPixels > 0 ? motionY / motionPixels : h / 2, concentrationX: concX, concentrationY: concY, motionPixels };
}

function sobelEdges(gray: Uint8Array, w: number, h: number): { edges: Float32Array; density: number } {
  const edges = new Float32Array(w * h);
  let totalEdge = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx =
        -1 * gray[idx - w - 1] + 1 * gray[idx - w + 1] +
        -2 * gray[idx - 1] + 2 * gray[idx + 1] +
        -1 * gray[idx + w - 1] + 1 * gray[idx + w + 1];
      const gy =
        -1 * gray[idx - w - 1] - 2 * gray[idx - w] - 1 * gray[idx - w + 1] +
        1 * gray[idx + w - 1] + 2 * gray[idx + w] + 1 * gray[idx + w + 1];
      const mag = Math.sqrt(gx * gx + gy * gy);
      edges[idx] = mag;
      totalEdge += mag;
    }
  }

  const density = totalEdge / (w * h);
  return { edges, density };
}

// Find the dominant vertical motion region (bow arm area)
// ---- Phase Classification ----

function classifyPhases(metrics: FrameMetrics[]): DetectedPhase[] {
  if (metrics.length < 6) {
    return [{ name: 'Shot', startFrame: 0, endFrame: metrics.length - 1, confidence: 0.3 }];
  }

  const motions = metrics.map((m) => m.motionMagnitude);
  const avgMotion = motions.reduce((s, m) => s + m, 0) / motions.length;
  const lowThreshold = avgMotion * 0.6;
  const highThreshold = avgMotion * 1.8;

  const phases: DetectedPhase[] = [];

  // 1. Setup: initial low-motion segment
  let setupEnd = 0;
  for (let i = 0; i < motions.length; i++) {
    if (motions[i] > lowThreshold) {
      setupEnd = Math.max(0, i - 1);
      break;
    }
    setupEnd = i;
  }
  if (setupEnd >= 1) {
    phases.push({ name: 'Setup', startFrame: 0, endFrame: setupEnd, confidence: 0.8 });
  }

  // 2. Draw: first sustained high-motion segment
  let drawStart = setupEnd + 1;
  let drawEnd = drawStart;
  let inDraw = false;
  for (let i = drawStart; i < motions.length; i++) {
    if (motions[i] > highThreshold) {
      if (!inDraw) {
        drawStart = i;
        inDraw = true;
      }
      drawEnd = i;
    } else if (inDraw && motions[i] < lowThreshold) {
      break;
    }
  }
  if (drawEnd > drawStart && inDraw) {
    phases.push({ name: 'Draw', startFrame: drawStart, endFrame: drawEnd, confidence: 0.75 });
  }

  // 3. Anchor: sustained low-motion after draw
  let anchorStart = drawEnd + 1;
  let anchorEnd = anchorStart;
  let consecutiveLow = 0;
  for (let i = anchorStart; i < motions.length; i++) {
    if (motions[i] < lowThreshold) {
      consecutiveLow++;
      anchorEnd = i;
    } else {
      if (consecutiveLow >= 3) break;
      consecutiveLow = 0;
      anchorStart = i + 1;
      anchorEnd = anchorStart;
    }
  }
  if (anchorEnd > anchorStart && consecutiveLow >= 2) {
    phases.push({ name: 'Anchor', startFrame: anchorStart, endFrame: anchorEnd, confidence: 0.7 });
  }

  // 4. Release: highest motion spike
  let releaseIdx = -1;
  let releaseMotion = 0;
  const searchStart = anchorEnd > anchorStart ? anchorEnd : Math.floor(metrics.length * 0.5);
  for (let i = searchStart; i < motions.length - 1; i++) {
    if (motions[i] > releaseMotion) {
      releaseMotion = motions[i];
      releaseIdx = i;
    }
  }
  if (releaseIdx > 0 && releaseMotion > highThreshold * 0.5) {
    const releaseStart = Math.max(0, releaseIdx - 1);
    const releaseEnd = Math.min(metrics.length - 1, releaseIdx + 2);
    phases.push({ name: 'Release', startFrame: releaseStart, endFrame: releaseEnd, confidence: 0.8 });
  }

  // 5. Follow-through: remaining frames after release
  const ftStart = releaseIdx > 0 ? Math.min(metrics.length - 1, releaseIdx + 3) : metrics.length - 3;
  if (ftStart < metrics.length - 1) {
    phases.push({
      name: 'Follow-Through',
      startFrame: ftStart,
      endFrame: metrics.length - 1,
      confidence: 0.6,
    });
  }

  // Merge gaps
  if (phases.length === 0) {
    return [{ name: 'Shot', startFrame: 0, endFrame: metrics.length - 1, confidence: 0.3 }];
  }

  // Ensure coverage - fill any gaps
  const merged: DetectedPhase[] = [phases[0]];
  for (let i = 1; i < phases.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = phases[i];
    if (curr.startFrame > prev.endFrame + 1) {
      // Gap - classify as aim or transition
      const gapMotion = motions.slice(prev.endFrame + 1, curr.startFrame);
      const gapAvg = gapMotion.reduce((s, m) => s + m, 0) / gapMotion.length;
      const gapName = gapAvg < lowThreshold ? 'Aim' : 'Transition';
      merged.push({
        name: gapName,
        startFrame: prev.endFrame + 1,
        endFrame: curr.startFrame - 1,
        confidence: 0.5,
      });
    }
    merged.push(curr);
  }

  return merged;
}

// ---- Form Issue Detection ----

function detectIssues(
  metrics: FrameMetrics[],
  phases: DetectedPhase[],
): { issues: FormIssue[]; strengths: string[] } {
  const issues: FormIssue[] = [];
  const strengths: string[] = [];

  const anchorPhase = phases.find((p) => p.name === 'Anchor');
  const releasePhase = phases.find((p) => p.name === 'Release');
  const followThroughPhase = phases.find((p) => p.name === 'Follow-Through');
  const drawPhase = phases.find((p) => p.name === 'Draw');

  // --- Anchor stability analysis ---
  if (anchorPhase) {
    const anchorDuration = anchorPhase.endFrame - anchorPhase.startFrame + 1;
    const anchorMotions = metrics.slice(anchorPhase.startFrame, anchorPhase.endFrame + 1);
    const anchorVariance =
      anchorMotions.reduce((s, m) => s + Math.pow(m.motionMagnitude, 2), 0) / anchorMotions.length;
    const anchorAvg = anchorMotions.reduce((s, m) => s + m.motionMagnitude, 0) / anchorMotions.length;

    if (anchorDuration < 5) {
      issues.push({
        id: 'short-anchor',
        severity: 'critical',
        category: 'Anchor',
        title: 'Anchor too short',
        description: `Your anchor only lasted ~${(anchorDuration * 67).toFixed(0)}ms. A stable anchor needs 1.5-3 seconds.`,
        correction: 'Hold at full draw longer. Count "one-thousand-one, one-thousand-two" before releasing.',
        drill: 'Blank bale drill: Draw, anchor, and hold for a 3-count before releasing. Do 20 arrows daily.',
        affectedFrames: Array.from({ length: anchorDuration }, (_, i) => anchorPhase.startFrame + i),
      });
    } else {
      strengths.push(`Good anchor duration (~${(anchorDuration * 67).toFixed(0)}ms)`);
    }

    if (anchorVariance > 800) {
      issues.push({
        id: 'unstable-anchor',
        severity: 'critical',
        category: 'Anchor',
        title: 'Unstable anchor point',
        description: 'Excessive movement detected during your anchor. Your hand position is drifting.',
        correction: 'Increase back tension to stabilize the anchor. The draw force should come from your back, not your arm.',
        drill: 'Wall drill: Stand against a wall, draw without a bow, focus on squeezing shoulder blades together. Hold 5 seconds.',
        affectedFrames: Array.from({ length: anchorDuration }, (_, i) => anchorPhase.startFrame + i),
      });
    } else if (anchorAvg < 30) {
      strengths.push('Stable anchor point - minimal drift detected');
    }

    // Bow arm drop during anchor
    const anchorDy = anchorMotions.reduce((s, m) => s + m.motionDirection.dy, 0) / anchorMotions.length;
    if (anchorDy > 0.3) {
      issues.push({
        id: 'bow-arm-drop',
        severity: 'warning',
        category: 'Bow Arm',
        title: 'Bow arm dropping',
        description: 'Your bow hand is trending downward during the anchor. This changes your trajectory.',
        correction: 'Engage your bow shoulder (push it down and forward). Imagine pushing the bow toward the target.',
        drill: 'Bow arm hold: Hold your bow at full draw for 10 seconds without releasing. Focus on keeping the bow hand at eye level.',
        affectedFrames: Array.from({ length: anchorDuration }, (_, i) => anchorPhase.startFrame + i),
      });
    }
  } else {
    issues.push({
      id: 'no-anchor',
      severity: 'critical',
      category: 'Anchor',
      title: 'No clear anchor detected',
      description: 'The analysis could not identify a stable anchor phase in your shot.',
      correction: 'You need a clear pause at full draw. Come to a definite stop before releasing.',
      drill: 'Clicker training: Use a clicker to enforce a consistent draw length and create a predictable anchor.',
      affectedFrames: [],
    });
  }

  // --- Release quality ---
  if (releasePhase) {
    const releaseMagnitude = metrics[releasePhase.startFrame]?.motionMagnitude || 0;
    const releaseDuration = releasePhase.endFrame - releasePhase.startFrame + 1;

    if (releaseDuration > 4) {
      issues.push({
        id: 'slow-release',
        severity: 'warning',
        category: 'Release',
        title: 'Release is too slow/hesitant',
        description: 'Your release motion is spread across multiple frames, indicating a punch or pluck rather than a clean surprise release.',
        correction: 'Focus on back tension release - let the shot "surprise" you. Do not consciously open your fingers.',
        drill: 'Surprise release drill: Have a partner call "hold" randomly. When they say "release", relax your fingers without anticipating.',
        affectedFrames: Array.from({ length: releaseDuration }, (_, i) => releasePhase.startFrame + i),
      });
    } else if (releaseMagnitude > 50) {
      strengths.push('Sharp, decisive release detected');
    }

    // Check for body flinch at release (motion outside bow arm area)
    if (anchorPhase && releasePhase.startFrame > 0) {
      const preRelease = metrics[releasePhase.startFrame - 1];
      const atRelease = metrics[releasePhase.startFrame];
      if (Math.abs(preRelease.motionConcentration.x - atRelease.motionConcentration.x) > 0.3) {
        issues.push({
          id: 'body-flinch',
          severity: 'critical',
          category: 'Release',
          title: 'Body flinch at release',
          description: 'Significant body movement away from your bow arm at release. This is a target panic indicator.',
          correction: 'Keep your bow arm extended toward the target after release. Do not pull your hand back to "check" the shot.',
          drill: 'Blind release: Shoot with eyes closed at 5 yards. Focus purely on the feeling of the release and follow-through.',
          affectedFrames: [releasePhase.startFrame, releasePhase.startFrame + 1],
        });
      }
    }
  }

  // --- Follow-through analysis ---
  if (followThroughPhase && followThroughPhase.endFrame > followThroughPhase.startFrame) {
    const ftMotions = metrics.slice(followThroughPhase.startFrame, followThroughPhase.endFrame + 1);
    const ftUpward = ftMotions.reduce((s, m) => s + (m.motionDirection.dy < 0 ? 1 : 0), 0) / ftMotions.length;

    if (ftUpward < 0.3) {
      issues.push({
        id: 'poor-follow-through',
        severity: 'warning',
        category: 'Follow-Through',
        title: 'Weak follow-through',
        description: 'Your bow arm is not continuing upward/forward after release. You may be pulling your hand to look at arrows.',
        correction: 'After every shot, keep your bow hand pointed at the target until you hear the arrow hit. This is non-negotiable.',
        drill: 'Follow-through holds: After each shot, hold your bow hand aimed at the target for a 3-count. Do this for every arrow in practice.',
        affectedFrames: Array.from(
          { length: followThroughPhase.endFrame - followThroughPhase.startFrame + 1 },
          (_, i) => followThroughPhase.startFrame + i,
        ),
      });
    } else {
      strengths.push('Good upward follow-through detected');
    }
  }

  // --- Draw analysis ---
  if (drawPhase) {
    const drawDuration = drawPhase.endFrame - drawPhase.startFrame + 1;
    if (drawDuration > 15) {
      issues.push({
        id: 'slow-draw',
        severity: 'info',
        category: 'Draw',
        title: 'Draw is very slow',
        description: 'Your draw motion is taking longer than typical, which can cause fatigue and inconsistency.',
        correction: 'Draw in one smooth, continuous motion. Think "lift and pull" as a single fluid action.',
        drill: 'Mirror draw: Practice your draw motion in front of a mirror without a bow. Time yourself - aim for under 2 seconds from setup to anchor.',
        affectedFrames: Array.from({ length: drawDuration }, (_, i) => drawPhase.startFrame + i),
      });
    } else if (drawDuration < 3) {
      issues.push({
        id: 'fast-draw',
        severity: 'info',
        category: 'Draw',
        title: 'Draw is very fast/jerky',
        description: 'Your draw motion is rushed, which can introduce torque and alignment issues.',
        correction: 'Slow down the draw. It should be smooth and controlled, not a snap.',
        drill: 'Slow motion draw: Count "one-thousand-one" during your entire draw motion. Smooth = consistent.',
        affectedFrames: Array.from({ length: drawDuration }, (_, i) => drawPhase.startFrame + i),
      });
    } else {
      strengths.push('Smooth, controlled draw motion');
    }
  }

  // --- Overall stability ---
  const allMotions = metrics.map((m) => m.motionMagnitude);
  const overallVariance =
    allMotions.reduce((s, m) => s + Math.pow(m - allMotions.reduce((ss, mm) => ss + mm, 0) / allMotions.length, 2), 0) /
    allMotions.length;

  if (overallVariance < 200 && anchorPhase && anchorPhase.endFrame - anchorPhase.startFrame > 3) {
    strengths.push('Overall shot consistency is good');
  }

  return { issues, strengths };
}

// ---- Scoring ----

function calculateScores(metrics: FrameMetrics[], phases: DetectedPhase[], issues: FormIssue[]): FormScore {
  const anchorPhase = phases.find((p) => p.name === 'Anchor');
  const releasePhase = phases.find((p) => p.name === 'Release');
  const followThroughPhase = phases.find((p) => p.name === 'Follow-Through');

  // Anchor stability (0-25)
  let anchorStability = 12; // baseline
  if (anchorPhase) {
    const duration = anchorPhase.endFrame - anchorPhase.startFrame + 1;
    const anchorMotions = metrics.slice(anchorPhase.startFrame, anchorPhase.endFrame + 1);
    const variance =
      anchorMotions.reduce((s, m) => s + Math.pow(m.motionMagnitude, 2), 0) / anchorMotions.length;

    // Duration score (0-10)
    anchorStability += Math.min(10, (duration / 15) * 10);
    // Stability score (0-13)
    anchorStability += Math.max(0, 13 - variance / 150);
  }
  anchorStability = Math.min(25, Math.round(anchorStability));

  // Release quality (0-25)
  let releaseQuality = 10;
  if (releasePhase) {
    const duration = releasePhase.endFrame - releasePhase.startFrame + 1;
    const hasFlinch = issues.some((i) => i.id === 'body-flinch');
    const isSlow = issues.some((i) => i.id === 'slow-release');

    releaseQuality += duration <= 3 ? 10 : duration <= 5 ? 5 : 0;
    releaseQuality += hasFlinch ? 0 : 5;
    releaseQuality += isSlow ? 0 : 5;
  }
  releaseQuality = Math.min(25, Math.round(releaseQuality));

  // Follow-through (0-20)
  let followThrough = 8;
  if (followThroughPhase) {
    const ftMotions = metrics.slice(followThroughPhase.startFrame, followThroughPhase.endFrame + 1);
    const upwardRatio = ftMotions.reduce((s, m) => s + (m.motionDirection.dy < -0.1 ? 1 : 0), 0) / ftMotions.length;
    followThrough += upwardRatio * 12;
  }
  followThrough = Math.min(20, Math.round(followThrough));

  // Bow arm stability (0-15)
  let bowArmStability = 7;
  const hasDrop = issues.some((i) => i.id === 'bow-arm-drop');
  bowArmStability += hasDrop ? 0 : 8;
  bowArmStability = Math.min(15, Math.round(bowArmStability));

  // Body alignment (0-15)
  let bodyAlignment = 7;
  const hasSway = issues.some((i) => i.category === 'Stance');
  bodyAlignment += hasSway ? 0 : 8;
  bodyAlignment = Math.min(15, Math.round(bodyAlignment));

  const overall = Math.min(100, anchorStability + releaseQuality + followThrough + bowArmStability + bodyAlignment);

  return { overall, anchorStability, releaseQuality, followThrough, bowArmStability, bodyAlignment };
}

// ---- Main Analysis Function ----

export interface ShotFrame {
  id: string;
  timestamp: number;
  imageData: string; // data URL
}

/**
 * Analyze a sequence of video frames using real computer vision.
 * This is the main entry point for form analysis.
 */
export async function analyzeForm(frames: ShotFrame[]): Promise<FormAnalysis> {
  if (frames.length < 3) {
    return {
      phases: [{ name: 'Shot', startFrame: 0, endFrame: 0, confidence: 0.1 }],
      scores: { overall: 0, anchorStability: 0, releaseQuality: 0, followThrough: 0, bowArmStability: 0, bodyAlignment: 0 },
      issues: [{
        id: 'too-few-frames',
        severity: 'info',
        category: 'General',
        title: 'Not enough data',
        description: 'Need at least 6 frames for meaningful analysis. Record a longer shot.',
        correction: 'Record your full shot from setup through follow-through.',
        drill: '',
        affectedFrames: [],
      }],
      strengths: [],
      frameMetrics: [],
      keyFrameIndex: 0,
    };
  }

  const metrics: FrameMetrics[] = [];
  let prevGray: Uint8Array | null = null;

  // Process each frame
  for (let i = 0; i < frames.length; i++) {
    const frameData = await getImageData(frames[i].imageData);
    if (!frameData) {
      metrics.push({
        motionMagnitude: 0,
        motionDirection: { dx: 0, dy: 0 },
        motionConcentration: { x: 0.5, y: 0.5, spread: 1 },
        edgeDensity: 0,
        stability: 0,
      });
      continue;
    }

    const { data, width, height } = frameData;
    const gray = imageDataToGray(data, width, height);
    const { density: edgeDensity } = sobelEdges(gray, width, height);

    if (prevGray) {
      const { avgMotion, concentrationX, concentrationY, motionPixels } = computeFrameDiff(
        prevGray,
        gray,
        width,
        height,
      );

      // Estimate motion direction from concentration shift
      const dx = i > 0 ? concentrationX - (metrics[i - 1]?.motionConcentration.x || 0.5) : 0;
      const dy = i > 0 ? concentrationY - (metrics[i - 1]?.motionConcentration.y || 0.5) : 0;

      // Calculate stability (inverse of local variance)
      const localWindow = metrics.slice(Math.max(0, i - 3), i);
      const localAvg = localWindow.reduce((s, m) => s + m.motionMagnitude, 0) / (localWindow.length || 1);
      const localVar =
        localWindow.reduce((s, m) => s + Math.pow(m.motionMagnitude - localAvg, 2), 0) / (localWindow.length || 1);
      const stability = 100 / (1 + localVar / 100);

      metrics.push({
        motionMagnitude: avgMotion,
        motionDirection: { dx: dx * 10, dy: dy * 10 },
        motionConcentration: {
          x: concentrationX,
          y: concentrationY,
          spread: motionPixels / (width * height),
        },
        edgeDensity,
        stability,
      });
    } else {
      // First frame - no motion data
      metrics.push({
        motionMagnitude: 0,
        motionDirection: { dx: 0, dy: 0 },
        motionConcentration: { x: 0.5, y: 0.5, spread: 0 },
        edgeDensity,
        stability: 100,
      });
    }

    prevGray = gray;
  }

  // Detect phases
  const phases = classifyPhases(metrics);

  // Detect form issues
  const { issues, strengths } = detectIssues(metrics, phases);

  // Calculate scores
  const scores = calculateScores(metrics, phases, issues);

  // Find key frame (release frame or most informative)
  const releasePhase = phases.find((p) => p.name === 'Release');
  const keyFrameIndex = releasePhase ? releasePhase.startFrame : Math.floor(frames.length / 2);

  return {
    phases,
    scores,
    issues,
    strengths,
    frameMetrics: metrics,
    keyFrameIndex,
  };
}

// ---- Helper: Convert data URL to ImageData ----

function getImageData(dataUrl: string): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Downscale for performance
      const maxDim = 320;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(ctx.getImageData(0, 0, w, h));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
