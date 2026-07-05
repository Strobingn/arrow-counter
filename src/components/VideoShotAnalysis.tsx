import { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Video, Play, Pause, Square, SkipBack, SkipForward, Camera, Trash2, ChevronLeft, ChevronRight, Maximize, Layers, Clock } from 'lucide-react';
import { useVideoAnalysis } from '@/hooks/useVideoAnalysis';
import { toast } from 'sonner';

interface VideoShotAnalysisProps {
  
}

const PHASE_COLORS: Record<string, string> = {
  'Setup': '#6b7280',
  'Draw': '#f59e0b',
  'Anchor': '#10b981',
  'Aim': '#3b82f6',
  'Release': '#ef4444',
  'Follow-Through': '#8b5cf6',
};

export function VideoShotAnalysis({ }: VideoShotAnalysisProps) {
  const { clips, isRecording, recordingTime, startRecording, stopRecording, deleteClip } = useVideoAnalysis();
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [compareClipId, setCompareClipId] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(0.5);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showCompare, setShowCompare] = useState(false);
  const playbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const activeClip = clips.find(c => c.id === activeClipId);
  const compareClip = clips.find(c => c.id === compareClipId);

  // Draw frame with overlays
  const drawFrame = useCallback((clip: typeof activeClip, frameIdx: number, targetCanvas?: HTMLCanvasElement) => {
    if (!clip || frameIdx >= clip.frames.length) return;
    const canvas = targetCanvas || canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      if (showOverlay) {
        // Alignment lines
        ctx.strokeStyle = 'rgba(13, 148, 136, 0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);

        // Vertical center line (bow arm alignment)
        ctx.beginPath();
        ctx.moveTo(canvas.width * 0.5, 0);
        ctx.lineTo(canvas.width * 0.5, canvas.height);
        ctx.stroke();

        // Horizontal anchor line
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
        ctx.beginPath();
        ctx.moveTo(0, canvas.height * 0.55);
        ctx.lineTo(canvas.width, canvas.height * 0.55);
        ctx.stroke();
        ctx.setLineDash([]);

        // Phase label
        const keyFrame = clip.keyFrames.find(kf => kf.frameIndex === frameIdx);
        if (keyFrame) {
          const color = PHASE_COLORS[keyFrame.phase] || '#666';
          ctx.fillStyle = color + 'cc';
          ctx.fillRect(8, 8, ctx.measureText(keyFrame.phase).width + 16, 28);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(keyFrame.phase, 16, 26);
        }

        // Frame counter
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(canvas.width - 80, canvas.height - 28, 72, 22);
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${frameIdx + 1}/${clip.frames.length}`, canvas.width - 72, canvas.height - 12);
      }
    };
    img.src = clip.frames[frameIdx].imageData;
  }, [showOverlay]);

  // Playback
  useEffect(() => {
    if (!isPlaying || !activeClip) return;
    const interval = 1000 / (15 * playbackSpeed); // 15fps base
    playbackRef.current = setInterval(() => {
      setCurrentFrame(prev => {
        if (prev >= (activeClip?.frames.length || 0) - 1) { setIsPlaying(false); return prev; }
        drawFrame(activeClip, prev + 1);
        return prev + 1;
      });
    }, interval);
    return () => { if (playbackRef.current) clearInterval(playbackRef.current); };
  }, [isPlaying, playbackSpeed, activeClip, drawFrame]);

  // Draw initial frame
  useEffect(() => {
    if (activeClip) drawFrame(activeClip, currentFrame);
  }, [activeClip, currentFrame, drawFrame]);

  const handleRecord = async () => {
    if (isRecording) {
      const clip = await stopRecording();
      if (clip) {
        setActiveClipId(clip.id);
        setCurrentFrame(0);
        toast.success('Shot captured! Auto-detected phases.');
      }
    } else {
      const started = await startRecording();
      if (started) toast.success('Recording started - shoot within 8 seconds');
      else toast.error('Camera access denied');
    }
  };

  if (!activeClip) {
    return (
      <Card className="p-4 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <Video className="w-4 h-4 text-primary" /> Shot Analysis
          </h3>
          <Badge variant={isRecording ? "destructive" : "secondary"} className="text-xs animate-pulse">
            {isRecording ? `${(recordingTime / 1000).toFixed(1)}s` : `${clips.length} clips`}
          </Badge>
        </div>

        {/* Record button */}
        <Button
          onClick={handleRecord}
          className={`w-full h-16 rounded-full text-lg font-bold transition-all ${
            isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-primary hover:bg-primary/90'
          }`}
        >
          {isRecording ? <><Square className="w-5 h-5 mr-2" /> Stop Recording</> : <><Camera className="w-5 h-5 mr-2" /> Record Shot</>}
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-2">
          {isRecording ? 'Recording... release when ready' : 'Records up to 8 seconds, auto-detects phases'}
        </p>

        {isRecording && <Progress value={(recordingTime / 8000) * 100} className="h-1 mt-2" />}

        {/* Clip list */}
        {clips.length > 0 && (
          <>
            <Separator className="my-3" />
            <h4 className="text-xs font-medium mb-2">Saved Clips</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {clips.map(clip => (
                <div key={clip.id} className="flex items-center gap-2 border rounded-xl p-2">
                  <div className="w-12 h-12 rounded-lg bg-secondary overflow-hidden shrink-0">
                    {clip.frames[0] && <img src={clip.frames[0].imageData} className="w-full h-full object-cover" alt="" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{clip.date}</p>
                    <div className="flex gap-1 flex-wrap">
                      {clip.keyFrames.map(kf => (
                        <span key={kf.phase} className="text-[9px] px-1 rounded" style={{ background: PHASE_COLORS[kf.phase] + '33', color: PHASE_COLORS[kf.phase] }}>
                          {kf.phase}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setActiveClipId(clip.id); setCurrentFrame(0); }}>
                    <Play className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteClip(clip.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-4 rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <Button size="sm" variant="ghost" onClick={() => { setActiveClipId(null); setIsPlaying(false); }}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex gap-1">
          {activeClip?.keyFrames.map(kf => (
            <button
              key={`${kf.phase}-${kf.frameIndex}`}
              onClick={() => { setCurrentFrame(kf.frameIndex); drawFrame(activeClip, kf.frameIndex); }}
              className="px-2 py-0.5 rounded text-[10px] font-medium text-white"
              style={{ background: PHASE_COLORS[kf.phase] }}
            >
              {kf.phase}
            </button>
          ))}
        </div>
        <Button size="sm" variant={showOverlay ? "default" : "outline"} onClick={() => setShowOverlay(!showOverlay)} className="h-7 text-xs">
          <Layers className="w-3 h-3 mr-1" />{showOverlay ? 'On' : 'Off'}
        </Button>
      </div>

      {/* Main canvas */}
      <div className="relative rounded-xl overflow-hidden bg-black mb-3">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* Compare view */}
      {showCompare && compareClip && (
        <div className="relative rounded-xl overflow-hidden bg-black mb-3">
          <canvas ref={(el) => { if (el) drawFrame(compareClip, Math.min(currentFrame, compareClip.frames.length - 1), el); }} className="w-full" />
          <Badge className="absolute top-2 right-2 text-[10px]">Compare</Badge>
        </div>
      )}

      {/* Frame scrubber */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setIsPlaying(false); setCurrentFrame(0); drawFrame(activeClip!, 0); }}>
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setCurrentFrame(Math.max(0, currentFrame - 1)); drawFrame(activeClip!, Math.max(0, currentFrame - 1)); }}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button size="sm" className="h-8 w-8 p-0 rounded-full" onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setCurrentFrame(Math.min((activeClip?.frames.length || 1) - 1, currentFrame + 1)); drawFrame(activeClip!, Math.min((activeClip?.frames.length || 1) - 1, currentFrame + 1)); }}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setIsPlaying(false); const last = (activeClip?.frames.length || 1) - 1; setCurrentFrame(last); drawFrame(activeClip!, last); }}>
            <SkipForward className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">
            <Clock className="w-3 h-3 inline mr-0.5" />{activeClip?.frames[currentFrame]?.timestamp || 0}ms
          </span>
        </div>
        <Slider
          value={[currentFrame]}
          max={Math.max(1, (activeClip?.frames.length || 1) - 1)}
          step={1}
          onValueChange={([v]) => { setIsPlaying(false); setCurrentFrame(v); drawFrame(activeClip!, v); }}
        />
      </div>

      {/* Speed control */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs text-muted-foreground">Speed:</span>
        <div className="flex gap-1">
          {[{ label: '0.25x', v: 0.25 }, { label: '0.5x', v: 0.5 }, { label: '1x', v: 1 }].map(s => (
            <Button key={s.v} size="sm" variant={playbackSpeed === s.v ? "default" : "outline"}
              className="h-7 text-xs px-2" onClick={() => setPlaybackSpeed(s.v)}>
              {s.label}
            </Button>
          ))}
        </div>
        <Button size="sm" variant={showCompare ? "default" : "outline"}
          className="h-7 text-xs ml-auto" onClick={() => { setShowCompare(!showCompare); if (!compareClipId && clips.length > 1) setCompareClipId(clips.find(c => c.id !== activeClipId)?.id || null); }}>
          <Maximize className="w-3 h-3 mr-1" />Compare
        </Button>
      </div>

      {/* Phase timeline */}
      <div className="flex h-6 rounded-lg overflow-hidden mb-3">
        {activeClip?.frames.map((_, i) => {
          const kf = activeClip.keyFrames.find(k => k.frameIndex === i);
          const color = kf ? PHASE_COLORS[kf.phase] : '#374151';
          return (
            <button
              key={i}
              className="flex-1 transition-all hover:opacity-80"
              style={{ background: color, opacity: i === currentFrame ? 1 : 0.5 }}
              onClick={() => { setCurrentFrame(i); drawFrame(activeClip, i); }}
            />
          );
        })}
      </div>
    </Card>
  );
}
