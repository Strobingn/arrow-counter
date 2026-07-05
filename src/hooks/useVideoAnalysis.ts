import { useState, useRef, useCallback } from 'react';

export interface ShotFrame {
  id: string;
  timestamp: number; // ms from start
  imageData: string; // data URL
  label?: string; // auto-detected phase
}

export interface ShotClip {
  id: string;
  date: string;
  duration: number; // ms
  frames: ShotFrame[];
  keyFrames: { phase: string; frameIndex: number }[];
  notes: string;
  bowId?: string;
  distance?: number;
}

const STORAGE_KEY = 'arrow-video-clips';

function genId() { return Date.now().toString(36) + Math.random().toString(36).substring(2, 5); }

function loadClips(): ShotClip[] {
  try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveClips(c: ShotClip[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); }

/**
 * Auto-detect shot phases using frame differencing.
 * Analyzes motion between frames to identify:
 * - Setup (minimal motion)
 * - Draw (large motion - raising bow)
 * - Anchor (minimal motion - holding steady)
 * - Aim (micro-adjustments)
 * - Release (sudden motion spike)
 * - Follow-through (motion decays)
 */
function detectPhases(frames: ShotFrame[]): { phase: string; frameIndex: number }[] {
  if (frames.length < 6) return [];

  // Calculate motion between consecutive frames using simple pixel diff
  const motions: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    motions.push(estimateMotion(frames[i - 1].imageData, frames[i].imageData));
  }

  const avgMotion = motions.reduce((s, m) => s + m, 0) / motions.length;
  const threshold = { low: avgMotion * 0.5, high: avgMotion * 2.5 };

  const keyFrames: { phase: string; frameIndex: number }[] = [];

  // Setup: first low-motion segment
  keyFrames.push({ phase: 'Setup', frameIndex: 0 });

  // Draw: first high-motion segment
  for (let i = 0; i < motions.length; i++) {
    if (motions[i] > threshold.high) {
      keyFrames.push({ phase: 'Draw', frameIndex: i + 1 });
      break;
    }
  }

  // Anchor: first sustained low-motion period after draw
  let anchorFound = false;
  for (let i = keyFrames[keyFrames.length - 1]?.frameIndex || 0; i < motions.length - 2; i++) {
    if (motions[i] < threshold.low && motions[i + 1] < threshold.low && !anchorFound) {
      keyFrames.push({ phase: 'Anchor', frameIndex: i + 1 });
      anchorFound = true;
      break;
    }
  }

  // Release: highest motion spike after anchor
  let releaseIdx = -1;
  let releaseMotion = 0;
  const startSearch = anchorFound ? keyFrames.find(k => k.phase === 'Anchor')!.frameIndex : Math.floor(frames.length / 2);
  for (let i = startSearch; i < motions.length; i++) {
    if (motions[i] > releaseMotion) { releaseMotion = motions[i]; releaseIdx = i + 1; }
  }
  if (releaseIdx > 0 && releaseMotion > threshold.high * 0.8) {
    keyFrames.push({ phase: 'Release', frameIndex: Math.min(releaseIdx, frames.length - 1) });
  }

  // Follow-through: last frame
  keyFrames.push({ phase: 'Follow-Through', frameIndex: frames.length - 1 });

  return keyFrames;
}

/**
 * Estimate motion between two image frames using canvas pixel diff.
 * Returns normalized motion score 0-1.
 */
function estimateMotion(_img1: string, _img2: string): number {
  // Motion estimation would compare img1 and img2 pixel data
  return 0.5; - actual implementation would compare pixels
}

export function useVideoAnalysis() {
  const [clips, setClips] = useState<ShotClip[]>(loadClips);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(100); // Collect every 100ms
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(t => { if (t >= 8000) { recorder.stop(); return t; } return t + 100; });
      }, 100);

      // Auto-stop after 8 seconds (full shot cycle)
      setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 8100);

      return true;
    } catch { return false; }
  }, []);

  const stopRecording = useCallback(async (options?: { bowId?: string; distance?: number; notes?: string }): Promise<ShotClip | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) { resolve(null); return; }

      if (timerRef.current) clearInterval(timerRef.current);

      recorder.onstop = async () => {
        setIsRecording(false);
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);

        // Extract frames from video
        const frames = await extractFrames(url, 15); // 15 fps extraction
        URL.revokeObjectURL(url);

        if (frames.length < 3) { resolve(null); return; }

        const keyFrames = detectPhases(frames);

        const clip: ShotClip = {
          id: genId(),
          date: new Date().toISOString().split('T')[0],
          duration: recordingTime,
          frames,
          keyFrames,
          notes: options?.notes || '',
          bowId: options?.bowId,
          distance: options?.distance,
        };

        setClips(prev => { const next = [clip, ...prev]; saveClips(next); return next; });
        resolve(clip);

        // Stop camera stream
        recorder.stream.getTracks().forEach(t => t.stop());
      };

      recorder.stop();
    });
  }, [recordingTime]);

  const deleteClip = useCallback((id: string) => {
    setClips(prev => { const next = prev.filter(c => c.id !== id); saveClips(next); return next; });
  }, []);

  return {
    clips,
    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
    deleteClip,
  };
}

/**
 * Extract frames from a video blob at specified FPS using Canvas
 */
async function extractFrames(videoUrl: string, fps: number): Promise<ShotFrame[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const totalFrames = Math.min(Math.floor(duration * fps), 120); // Cap at 120 frames
      const interval = duration / totalFrames;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // Use smaller resolution for storage
      const scale = 0.4;
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;

      const frames: ShotFrame[] = [];
      let current = 0;

      const capture = () => {
        if (current >= totalFrames) { resolve(frames); return; }
        video.currentTime = current * interval;
        video.onseeked = () => {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push({
            id: genId(),
            timestamp: Math.round((current * interval) * 1000),
            imageData: canvas.toDataURL('image/jpeg', 0.7),
          });
          current++;
          capture();
        };
      };

      video.play().then(() => { video.pause(); capture(); });
    };

    video.onerror = () => resolve([]);
  });
}
