/**
 * Real ML Pose Analysis using TensorFlow.js MoveNet
 * Loaded lazily from CDN to keep bundle size small.
 * Caches model after first load.
 */

// TF.js loaded dynamically from CDN at runtime

export interface PoseKeypoint {
  name: string;
  x: number;
  y: number;
  score: number; // confidence 0-1
}

export interface FramePose {
  frameIndex: number;
  keypoints: PoseKeypoint[];
  timestamp: number;
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
  overall: number;
  anchorStability: number;
  releaseQuality: number;
  followThrough: number;
  bowArmStability: number;
  posture: number;
}

export interface PoseAnalysis {
  framePoses: FramePose[];
  scores: FormScore;
  issues: FormIssue[];
  strengths: string[];
  phaseFrames: { phase: string; start: number; end: number }[];
}

// ---- TF.js lazy loader ----
let detector: any = null;
let tfLoading = false;
let tfCallbacks: Array<(d: any) => void> = [];

async function getDetector(): Promise<any> {
  if (detector) return detector;
  if (tfLoading) {
    return new Promise((resolve) => tfCallbacks.push(resolve));
  }
  tfLoading = true;

  // Dynamically load TF.js from CDN
  await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@4.22.0/dist/tf-core.min.js');
  await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@4.22.0/dist/tf-backend-webgl.min.js');
  await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js');

  const tf = (window as any).tf;
  const poseDetection = (window as any).poseDetection;

  await tf.setBackend('webgl');
  await tf.ready();

  detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    {
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      minPoseScore: 0.2,
    }
  );

  tfCallbacks.forEach((cb) => cb(detector));
  tfCallbacks = [];
  tfLoading = false;
  return detector;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// ---- Analysis from pose data ----

function analyzePoses(poses: FramePose[]): { scores: FormScore; issues: FormIssue[]; strengths: string[]; phaseFrames: { phase: string; start: number; end: number }[] } {
  if (poses.length < 5) {
    return {
      scores: { overall: 0, anchorStability: 0, releaseQuality: 0, followThrough: 0, bowArmStability: 0, posture: 0 },
      issues: [{
        id: 'too-few-frames',
        severity: 'info',
        category: 'General',
        title: 'Not enough data',
        description: 'Need more frames for pose analysis. Record a longer shot.',
        correction: 'Record your full shot from setup through follow-through.',
        drill: '',
        affectedFrames: [],
      }],
      strengths: [],
      phaseFrames: [],
    };
  }

  const issues: FormIssue[] = [];
  const strengths: string[] = [];

  // Extract key joint tracks
  const rightWristY = poses.map((p) => getKP(p, 'right_wrist')?.y ?? null);
  const leftWristY = poses.map((p) => getKP(p, 'left_wrist')?.y ?? null);
  const noseY = poses.map((p) => getKP(p, 'nose')?.y ?? null);

  // Detect phases from wrist motion
  const drawWristY = rightWristY.some((v) => v !== null) ? rightWristY : leftWristY;
  const motion = computeMotion(drawWristY);
  const phases = detectPhasesFromMotion(motion);

  // Find key phases
  const anchorPhase = phases.find((p) => p.phase === 'Anchor');
  const releasePhase = phases.find((p) => p.phase === 'Release');
  const followThroughPhase = phases.find((p) => p.phase === 'Follow-Through');

  // ---- ANCHOR STABILITY (0-25) ----
  let anchorStability = 10;
  if (anchorPhase) {
    const anchorFrames = poses.slice(anchorPhase.start, anchorPhase.end + 1);
    const anchorDuration = anchorPhase.end - anchorPhase.start + 1;

    // Wrist position variance during anchor
    const anchorWristX = anchorFrames.map((p) => getKP(p, 'right_wrist')?.x ?? getKP(p, 'left_wrist')?.x ?? null).filter((v): v is number => v !== null);
    const anchorWristY = anchorFrames.map((p) => getKP(p, 'right_wrist')?.y ?? getKP(p, 'left_wrist')?.y ?? null).filter((v): v is number => v !== null);

    const xVar = variance(anchorWristX);
    const yVar = variance(anchorWristY);

    // Duration score
    anchorStability += Math.min(10, (anchorDuration / 20) * 10);
    // Stability score - lower variance = better
    const stabilityScore = Math.max(0, 10 - (xVar + yVar) * 200);
    anchorStability += stabilityScore;

    if (anchorDuration < 8) {
      issues.push({
        id: 'short-anchor',
        severity: 'critical',
        category: 'Anchor',
        title: 'Anchor too short',
        description: `Your anchor only lasted ~${Math.round(anchorDuration * 100)}ms. A stable anchor needs 1-3 seconds.`,
        correction: 'Hold at full draw for a 2-count before releasing. Do not rush.',
        drill: 'Count "one-thousand-one, one-thousand-two" at anchor before every release. 20 arrows daily.',
        affectedFrames: Array.from({ length: anchorDuration }, (_, i) => anchorPhase.start + i),
      });
    } else {
      strengths.push(`Good anchor duration (${Math.round(anchorDuration * 100)}ms)`);
    }

    if ((xVar + yVar) > 0.003) {
      issues.push({
        id: 'unstable-anchor',
        severity: 'critical',
        category: 'Anchor',
        title: 'Hand drifting at anchor',
        description: 'Your anchor hand is moving too much during the hold. Group will open up.',
        correction: 'Increase back tension. The draw should come from squeezing your shoulder blades, not pulling with your arm.',
        drill: 'Wall drill: Stand arm-length from a wall. Draw motion while keeping your hand touching one spot on the wall. Hold 5 seconds.',
        affectedFrames: Array.from({ length: anchorDuration }, (_, i) => anchorPhase.start + i),
      });
    } else {
      strengths.push('Stable anchor point - minimal hand drift');
    }

    // Bow arm (non-draw arm) drop check
    const bowArmWristY = anchorFrames
      .map((p) => getKP(p, 'left_wrist')?.y ?? getKP(p, 'right_wrist')?.y ?? null)
      .filter((v): v is number => v !== null);
    const bowTrend = linearTrend(bowArmWristY);
    if (bowTrend > 0.001) {
      issues.push({
        id: 'bow-arm-drop',
        severity: 'warning',
        category: 'Bow Arm',
        title: 'Bow arm dropping at anchor',
        description: 'Your bow hand is trending downward during the anchor phase.',
        correction: 'Push your bow shoulder down and forward. Keep the bow hand at the same height through the entire shot.',
        drill: 'Bow arm endurance: Hold your bow at full draw for 10 seconds, 5 reps. Focus on keeping the bow hand at eye level.',
        affectedFrames: Array.from({ length: anchorDuration }, (_, i) => anchorPhase.start + i),
      });
    }
  } else {
    issues.push({
      id: 'no-anchor',
      severity: 'critical',
      category: 'Anchor',
      title: 'No clear anchor detected',
      description: 'Could not identify a stable anchor phase. You may be snap-shooting.',
      correction: 'Come to a definite, conscious stop at full draw before releasing.',
      drill: 'Clicker drill: Use a clicker to enforce a consistent draw length and create a predictable anchor every shot.',
      affectedFrames: [],
    });
  }

  // ---- RELEASE QUALITY (0-25) ----
  let releaseQuality = 10;
  if (releasePhase && anchorPhase) {
    const releaseIdx = releasePhase.start;
    const preReleaseWrist = drawWristY[Math.max(0, releaseIdx - 1)];
    const postReleaseWrist = drawWristY[Math.min(drawWristY.length - 1, releaseIdx + 1)];

    if (preReleaseWrist !== null && postReleaseWrist !== null) {
      const releaseSpeed = Math.abs(postReleaseWrist - preReleaseWrist);

      if (releaseSpeed < 0.02) {
        // Slow release = pluck/punch
        issues.push({
          id: 'slow-release',
          severity: 'warning',
          category: 'Release',
          title: 'Hesitant release (plucking)',
          description: 'Your release hand is moving too slowly through the release. This causes left-right dispersion.',
          correction: 'Focus on a surprise release. Do not consciously open your fingers. Let back tension do the work.',
          drill: 'Surprise release: Have a partner tell you when to release randomly. Just relax your fingers on command without anticipation.',
          affectedFrames: [releaseIdx, releaseIdx + 1],
        });
      } else if (releaseSpeed > 0.05) {
        releaseQuality += 8;
        strengths.push('Clean, sharp release detected');
      }

      // Check for head movement at release
      const currNose = noseY[releaseIdx];
      const prevNose = noseY[releaseIdx - 1];
      if (currNose !== null && prevNose !== null) {
        const headDrop = Math.abs(currNose - prevNose);
        if (headDrop > 0.02) {
          issues.push({
            id: 'head-flinch',
            severity: 'critical',
            category: 'Release',
            title: 'Head flinching at release',
            description: 'Your head drops/peeks at the moment of release. This is the #1 cause of high shots.',
            correction: 'Keep your head absolutely still until you hear the arrow hit the target. Do not look at your arrows.',
            drill: 'Blind shooting: Shoot at 5 yards with eyes closed. Focus on keeping your head still through the entire shot cycle.',
            affectedFrames: [releaseIdx],
          });
        }
      }

      // Follow-through check - wrist should continue backward
      if (followThroughPhase) {
        const ftWristY = drawWristY.slice(followThroughPhase.start, followThroughPhase.end + 1).filter((v): v is number => v !== null);
        const ftTrend = linearTrend(ftWristY);
        if (ftTrend < -0.001) {
          releaseQuality += 7;
          strengths.push('Good follow-through - hand continues backward');
        } else {
          issues.push({
            id: 'poor-follow-through',
            severity: 'warning',
            category: 'Follow-Through',
            title: 'Weak follow-through',
            description: 'Your release hand is not continuing backward after the shot. You may be pulling it forward to check arrows.',
            correction: 'After release, your hand should fly straight back toward your ear. Keep it there until you hear the hit.',
            drill: 'Follow-through hold: After every shot, hold your release hand back by your ear for a 3-count. Every single arrow.',
            affectedFrames: Array.from({ length: followThroughPhase.end - followThroughPhase.start + 1 }, (_, i) => followThroughPhase.start + i),
          });
        }
      }
    }
  }
  releaseQuality = Math.min(25, Math.round(releaseQuality));

  // ---- FOLLOW-THROUGH (0-20) ----
  let followThrough = 8;
  if (followThroughPhase) {
    const ftFrames = poses.slice(followThroughPhase.start, followThroughPhase.end + 1);
    const ftDuration = followThroughPhase.end - followThroughPhase.start + 1;
    followThrough += Math.min(7, (ftDuration / 10) * 7);

    // Check bow arm stays up
    const bowShoulderY = ftFrames.map((p) => getKP(p, 'left_shoulder')?.y ?? getKP(p, 'right_shoulder')?.y ?? null).filter((v): v is number => v !== null);
    if (bowShoulderY.length > 1) {
      const shoulderTrend = linearTrend(bowShoulderY);
      if (shoulderTrend < 0.001) {
        followThrough += 5;
      } else {
        issues.push({
          id: 'bow-drops-after',
          severity: 'warning',
          category: 'Follow-Through',
          title: 'Bow dropping after release',
          description: 'Your bow arm is dropping immediately after release. Keep it pointed at the target.',
          correction: 'After release, keep your bow hand aimed at the target until you hear the arrow hit. Do not look at your arrows.',
          drill: 'Post-shot hold: Keep your bow aimed at the target for 2 full seconds after every release. Use a timer.',
          affectedFrames: Array.from({ length: ftDuration }, (_, i) => followThroughPhase.start + i),
        });
      }
    }
  }
  followThrough = Math.min(20, Math.round(followThrough));

  // ---- BOW ARM STABILITY (0-15) ----
  let bowArmStability = 8;
  const hasBowDrop = issues.some((i) => i.id === 'bow-arm-drop');
  bowArmStability += hasBowDrop ? 0 : 7;
  bowArmStability = Math.min(15, Math.round(bowArmStability));

  // ---- POSTURE (0-15) ----
  let posture = 8;
  // Check if shoulders stay level throughout
  const shoulderLevel = poses.map((p) => {
    const l = getKP(p, 'left_shoulder')?.y;
    const r = getKP(p, 'right_shoulder')?.y;
    return l !== undefined && r !== undefined ? Math.abs(l - r) : null;
  }).filter((v): v is number => v !== null);

  if (shoulderLevel.length > 0) {
    const avgTilt = shoulderLevel.reduce((s, v) => s + v, 0) / shoulderLevel.length;
    if (avgTilt < 0.03) {
      posture += 7;
      strengths.push('Good level shoulders throughout the shot');
    } else {
      issues.push({
        id: 'uneven-shoulders',
        severity: 'warning',
        category: 'Posture',
        title: 'Uneven shoulders',
        description: `Your shoulders are tilting by ${Math.round(avgTilt * 100)}% on average. This creates inconsistent alignment.`,
        correction: 'Square your shoulders to the target. Imagine a line from your bow shoulder to your draw shoulder - it should be level.',
        drill: 'Mirror check: Stand in front of a mirror in your stance. Verify both shoulders are at the same height. Practice daily.',
        affectedFrames: [],
      });
    }
  }
  posture = Math.min(15, Math.round(posture));

  const overall = Math.min(100, anchorStability + releaseQuality + followThrough + bowArmStability + posture);

  return {
    scores: { overall, anchorStability, releaseQuality, followThrough, bowArmStability, posture },
    issues,
    strengths,
    phaseFrames: phases,
  };
}

// ---- Helpers ----

function getKP(pose: FramePose, name: string): PoseKeypoint | undefined {
  return pose.keypoints.find((kp) => kp.name === name);
}

function computeMotion(values: (number | null)[]): number[] {
  const result: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== null && values[i - 1] !== null) {
      result.push(Math.abs(values[i]! - values[i - 1]!));
    } else {
      result.push(0);
    }
  }
  return result;
}

function detectPhasesFromMotion(motion: number[]): { phase: string; start: number; end: number }[] {
  const avg = motion.reduce((s, m) => s + m, 0) / motion.length || 0.001;
  const low = avg * 0.5;
  const high = avg * 2;

  const phases: { phase: string; start: number; end: number }[] = [];

  // Setup
  let setupEnd = 0;
  for (let i = 0; i < motion.length; i++) {
    if (motion[i] > low) { setupEnd = Math.max(0, i - 1); break; }
    setupEnd = i;
  }
  if (setupEnd >= 1) phases.push({ phase: 'Setup', start: 0, end: setupEnd });

  // Draw
  let drawStart = setupEnd + 1;
  let drawEnd = drawStart;
  let inDraw = false;
  for (let i = drawStart; i < motion.length; i++) {
    if (motion[i] > high) { if (!inDraw) { drawStart = i; inDraw = true; } drawEnd = i; }
    else if (inDraw && motion[i] < low) break;
  }
  if (drawEnd > drawStart && inDraw) phases.push({ phase: 'Draw', start: drawStart, end: drawEnd });

  // Anchor
  let anchorStart = drawEnd + 1;
  let anchorEnd = anchorStart;
  let lowCount = 0;
  for (let i = anchorStart; i < motion.length; i++) {
    if (motion[i] < low) { lowCount++; anchorEnd = i; }
    else { if (lowCount >= 2) break; lowCount = 0; anchorStart = i + 1; anchorEnd = anchorStart; }
  }
  if (anchorEnd > anchorStart && lowCount >= 2) phases.push({ phase: 'Anchor', start: anchorStart, end: anchorEnd });

  // Release
  let releaseIdx = -1;
  let releaseMax = 0;
  const searchFrom = anchorEnd > anchorStart ? anchorEnd : Math.floor(motion.length / 2);
  for (let i = searchFrom; i < motion.length; i++) {
    if (motion[i] > releaseMax) { releaseMax = motion[i]; releaseIdx = i; }
  }
  if (releaseIdx > 0 && releaseMax > high * 0.4) {
    phases.push({ phase: 'Release', start: Math.max(0, releaseIdx - 1), end: Math.min(motion.length - 1, releaseIdx + 2) });
  }

  // Follow-through
  const ftStart = releaseIdx > 0 ? Math.min(motion.length - 1, releaseIdx + 3) : motion.length - 5;
  if (ftStart < motion.length - 1) phases.push({ phase: 'Follow-Through', start: ftStart, end: motion.length - 1 });

  // Fill gaps
  const merged: typeof phases = [];
  if (phases.length === 0) return [{ phase: 'Shot', start: 0, end: motion.length - 1 }];
  merged.push(phases[0]);
  for (let i = 1; i < phases.length; i++) {
    if (phases[i].start > merged[merged.length - 1].end + 1) {
      merged.push({ phase: 'Aim', start: merged[merged.length - 1].end + 1, end: phases[i].start - 1 });
    }
    merged.push(phases[i]);
  }
  return merged;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
}

function linearTrend(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = values.reduce((s, v) => s + v, 0);
  const sumXY = values.reduce((s, v, i) => s + i * v, 0);
  const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
  return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
}

// ---- Main analysis function ----

export async function analyzeVideoFrames(
  frameImages: string[]
): Promise<{ poseAnalysis: PoseAnalysis; loadingProgress: (p: number) => void }> {
  const framePoses: FramePose[] = [];

  const detector = await getDetector();

  for (let i = 0; i < frameImages.length; i++) {
    const img = await loadImage(frameImages[i]);
    const poses = await detector.estimatePoses(img);

    if (poses.length > 0 && poses[0].keypoints) {
      const keypoints: PoseKeypoint[] = poses[0].keypoints
        .filter((kp: any) => kp.score > 0.15)
        .map((kp: any) => ({
          name: kp.name,
          x: kp.x / img.width,
          y: kp.y / img.height,
          score: kp.score,
        }));
      framePoses.push({ frameIndex: i, keypoints, timestamp: 0 });
    } else {
      framePoses.push({ frameIndex: i, keypoints: [], timestamp: 0 });
    }
  }

  const { scores, issues, strengths, phaseFrames } = analyzePoses(framePoses);

  return {
    poseAnalysis: { framePoses, scores, issues, strengths, phaseFrames },
    loadingProgress: () => {},
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Overlay keypoints on canvas for display
export function drawPoseOverlay(
  ctx: CanvasRenderingContext2D,
  pose: FramePose,
  canvasWidth: number,
  canvasHeight: number
) {
  const kpMap = new Map(pose.keypoints.map((kp) => [kp.name, kp]));

  // Draw skeleton connections
  const connections: [string, string][] = [
    ['left_shoulder', 'right_shoulder'],
    ['left_shoulder', 'left_elbow'],
    ['left_elbow', 'left_wrist'],
    ['right_shoulder', 'right_elbow'],
    ['right_elbow', 'right_wrist'],
    ['left_shoulder', 'left_hip'],
    ['right_shoulder', 'right_hip'],
    ['left_hip', 'right_hip'],
    ['left_hip', 'left_knee'],
    ['left_knee', 'left_ankle'],
    ['right_hip', 'right_knee'],
    ['right_knee', 'right_ankle'],
  ];

  ctx.lineWidth = 2;
  for (const [a, b] of connections) {
    const kpA = kpMap.get(a);
    const kpB = kpMap.get(b);
    if (kpA && kpB && kpA.score > 0.15 && kpB.score > 0.15) {
      ctx.strokeStyle = `rgba(59, 130, 246, ${Math.min(kpA.score, kpB.score)})`;
      ctx.beginPath();
      ctx.moveTo(kpA.x * canvasWidth, kpA.y * canvasHeight);
      ctx.lineTo(kpB.x * canvasWidth, kpB.y * canvasHeight);
      ctx.stroke();
    }
  }

  // Draw keypoints
  for (const kp of pose.keypoints) {
    if (kp.score < 0.15) continue;
    const x = kp.x * canvasWidth;
    const y = kp.y * canvasHeight;

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(16, 185, 129, ${kp.score})`;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
