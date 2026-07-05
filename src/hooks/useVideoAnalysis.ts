import { useState, useRef, useCallback } from 'react';
import { analyzeVideoFrames, type PoseAnalysis } from './usePoseAnalysis';

export interface ShotFrame {
  id: string;
  timestamp: number;
  imageData: string;
}

export interface ShotClip {
  id: string;
  date: string;
  duration: number;
  frames: ShotFrame[];
  poseAnalysis: PoseAnalysis | null;
  notes: string;
  bowId?: string;
  distance?: number;
}

const STORAGE_KEY = 'arrow-video-clips-v3';

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
}

function loadClips(): ShotClip[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : [];
  } catch { return []; }
}

function saveClips(c: ShotClip[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

function getSupportedMimeType(): string {
  const types = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'];
  for (const t of types) { if (MediaRecorder.isTypeSupported(t)) return t; }
  return '';
}

export function useVideoAnalysis() {
  const [clips, setClips] = useState<ShotClip[]>(loadClips);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [lastError, setLastError] = useState<string>('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setStream(null);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setLastError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setLastError('Camera API not supported'); return false;
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      const mimeType = getSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(t => { if (t >= 90000) { recorder.stop(); return t; } return t + 100; });
      }, 100);
      timeoutRef.current = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 90100);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      let friendly = msg;
      if (msg.includes('Permission') || msg.includes('NotAllowed')) friendly = 'Camera permission denied. Enable it in Settings > Apps > Arrow Counter > Permissions.';
      else if (msg.includes('NotFound')) friendly = 'No camera found.';
      else if (msg.includes('NotReadable')) friendly = 'Camera in use by another app.';
      setLastError(friendly);
      return false;
    }
  }, []);

  const stopRecording = useCallback(
    async (opts?: { bowId?: string; distance?: number; notes?: string }): Promise<ShotClip | null> => {
      return new Promise(resolve => {
        const recorder = mediaRecorderRef.current;
        if (!recorder) { resolve(null); return; }
        if (timerRef.current) clearInterval(timerRef.current);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        recorder.onstop = async () => {
          setIsRecording(false);
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
          const url = URL.createObjectURL(blob);
          const frames = await extractFrames(url, 8);
          URL.revokeObjectURL(url);
          stopCamera();
          if (frames.length < 5) { resolve(null); return; }

          setIsAnalyzing(true);
          setAnalysisProgress(5);

          let poseAnalysis: PoseAnalysis | null = null;
          try {
            const frameUrls = frames.map(f => f.imageData);
            const result = await analyzeVideoFrames(frameUrls);
            poseAnalysis = result.poseAnalysis;
          } catch {
            poseAnalysis = null;
          }
          setIsAnalyzing(false);
          setAnalysisProgress(100);

          const clip: ShotClip = {
            id: genId(), date: new Date().toISOString().split('T')[0],
            duration: recordingTime, frames, poseAnalysis,
            notes: opts?.notes || '', bowId: opts?.bowId, distance: opts?.distance,
          };
          setClips(prev => { const next = [clip, ...prev]; saveClips(next); return next; });
          resolve(clip);
        };
        recorder.stop();
      });
    }, [recordingTime, stopCamera]
  );

  const deleteClip = useCallback((id: string) => {
    setClips(prev => { const next = prev.filter(c => c.id !== id); saveClips(next); return next; });
  }, []);

  return { clips, isRecording, isAnalyzing, analysisProgress, recordingTime, stream, lastError, startRecording, stopRecording, deleteClip };
}

async function extractFrames(videoUrl: string, fps: number): Promise<ShotFrame[]> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.src = videoUrl; video.muted = true; video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (!isFinite(duration) || duration <= 0) { resolve([]); return; }
      const totalFrames = Math.min(Math.floor(duration * fps), 60);
      const interval = duration / totalFrames;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve([]); return; }
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
          frames.push({ id: genId(), timestamp: Math.round(current * interval * 1000), imageData: canvas.toDataURL('image/jpeg', 0.65) });
          current++; capture();
        };
      };
      video.play().then(() => { video.pause(); capture(); }).catch(() => resolve([]));
    };
    video.onerror = () => resolve([]);
  });
}
