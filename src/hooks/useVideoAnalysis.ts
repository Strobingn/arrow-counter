import { useState, useRef, useCallback } from 'react';

export interface ShotFrame {
  id: string;
  timestamp: number;
  imageData: string;
  label?: string;
}

export interface ShotClip {
  id: string;
  date: string;
  duration: number;
  frames: ShotFrame[];
  keyFrames: { phase: string; frameIndex: number }[];
  notes: string;
  bowId?: string;
  distance?: number;
}

const STORAGE_KEY = 'arrow-video-clips';

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
}

function loadClips(): ShotClip[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function saveClips(c: ShotClip[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

function detectPhases(frames: ShotFrame[]): { phase: string; frameIndex: number }[] {
  if (frames.length < 6) return [];

  const motions: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    motions.push(estimateMotion(frames[i - 1].imageData, frames[i].imageData));
  }

  const avgMotion = motions.reduce((s, m) => s + m, 0) / motions.length;
  const threshold = { low: avgMotion * 0.5, high: avgMotion * 2.5 };

  const keyFrames: { phase: string; frameIndex: number }[] = [];
  keyFrames.push({ phase: 'Setup', frameIndex: 0 });

  for (let i = 0; i < motions.length; i++) {
    if (motions[i] > threshold.high) {
      keyFrames.push({ phase: 'Draw', frameIndex: i + 1 });
      break;
    }
  }

  let anchorFound = false;
  for (let i = keyFrames[keyFrames.length - 1]?.frameIndex || 0; i < motions.length - 2; i++) {
    if (motions[i] < threshold.low && motions[i + 1] < threshold.low && !anchorFound) {
      keyFrames.push({ phase: 'Anchor', frameIndex: i + 1 });
      anchorFound = true;
      break;
    }
  }

  let releaseIdx = -1;
  let releaseMotion = 0;
  const startSearch = anchorFound
    ? keyFrames.find((k) => k.phase === 'Anchor')!.frameIndex
    : Math.floor(frames.length / 2);
  for (let i = startSearch; i < motions.length; i++) {
    if (motions[i] > releaseMotion) {
      releaseMotion = motions[i];
      releaseIdx = i + 1;
    }
  }
  if (releaseIdx > 0 && releaseMotion > threshold.high * 0.8) {
    keyFrames.push({
      phase: 'Release',
      frameIndex: Math.min(releaseIdx, frames.length - 1),
    });
  }

  keyFrames.push({ phase: 'Follow-Through', frameIndex: frames.length - 1 });
  return keyFrames;
}

function estimateMotion(_img1: string, _img2: string): number {
  return 0.5;
}

function getSupportedMimeType(): string {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export function useVideoAnalysis() {
  const [clips, setClips] = useState<ShotClip[]>(loadClips);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [lastError, setLastError] = useState<string>('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setLastError('');

    // Check for getUserMedia support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setLastError('Camera API not supported on this device/browser.');
      return false;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);

      // Try to find a supported MIME type
      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(mediaStream, { mimeType })
        : new MediaRecorder(mediaStream);

      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((t) => {
          if (t >= 90000) {
            recorder.stop();
            return t;
          }
          return t + 100;
        });
      }, 100);

      timeoutRef.current = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 90100);

      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      let friendly = message;

      if (message.includes('Permission denied') || message.includes('NotAllowedError')) {
        friendly = 'Camera permission denied. Please allow camera access in your device settings.';
      } else if (message.includes('NotFoundError') || message.includes('DevicesNotFound')) {
        friendly = 'No camera found on this device.';
      } else if (message.includes('NotReadableError') || message.includes('TrackStartError')) {
        friendly = 'Camera is already in use by another app.';
      } else if (message.includes('OverconstrainedError')) {
        friendly = 'Camera does not support requested resolution. Try a different device.';
      } else if (message.includes('SecurityError')) {
        friendly = 'Camera blocked by security policy. For Android apps, ensure CAMERA permission is granted in Settings > Apps > Arrow Counter > Permissions.';
      }

      setLastError(friendly);
      return false;
    }
  }, []);

  const stopRecording = useCallback(
    async (options?: { bowId?: string; distance?: number; notes?: string }): Promise<ShotClip | null> => {
      return new Promise((resolve) => {
        const recorder = mediaRecorderRef.current;
        if (!recorder) {
          resolve(null);
          return;
        }

        if (timerRef.current) clearInterval(timerRef.current);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        recorder.onstop = async () => {
          setIsRecording(false);
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
          const url = URL.createObjectURL(blob);

          const frames = await extractFrames(url, 15);
          URL.revokeObjectURL(url);

          // Stop camera stream after frames extracted
          stopCamera();

          if (frames.length < 3) {
            resolve(null);
            return;
          }

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

          setClips((prev) => {
            const next = [clip, ...prev];
            saveClips(next);
            return next;
          });
          resolve(clip);
        };

        recorder.stop();
      });
    },
    [recordingTime, stopCamera],
  );

  const deleteClip = useCallback((id: string) => {
    setClips((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveClips(next);
      return next;
    });
  }, []);

  return {
    clips,
    isRecording,
    recordingTime,
    stream,
    lastError,
    startRecording,
    stopRecording,
    deleteClip,
  };
}

async function extractFrames(videoUrl: string, fps: number): Promise<ShotFrame[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (!isFinite(duration) || duration <= 0) {
        resolve([]);
        return;
      }
      const totalFrames = Math.min(Math.floor(duration * fps), 120);
      const interval = duration / totalFrames;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve([]);
        return;
      }

      const scale = 0.4;
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;

      const frames: ShotFrame[] = [];
      let current = 0;

      const capture = () => {
        if (current >= totalFrames) {
          resolve(frames);
          return;
        }
        video.currentTime = current * interval;
        video.onseeked = () => {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push({
            id: genId(),
            timestamp: Math.round(current * interval * 1000),
            imageData: canvas.toDataURL('image/jpeg', 0.7),
          });
          current++;
          capture();
        };
      };

      video
        .play()
        .then(() => {
          video.pause();
          capture();
        })
        .catch(() => resolve([]));
    };

    video.onerror = () => resolve([]);
  });
}
