import { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Video, Play, Pause, Square, SkipBack, SkipForward, Camera, Trash2, ChevronLeft, ChevronRight, Layers, Clock, AlertCircle, Target, TrendingUp, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Sparkles, User } from 'lucide-react';
import { useVideoAnalysis } from '@/hooks/useVideoAnalysis';
import type { FormIssue } from '@/hooks/usePoseAnalysis';
import { drawPoseOverlay } from '@/hooks/usePoseAnalysis';
import { toast } from 'sonner';

const PHASE_COLORS: Record<string, string> = {
  Setup: '#6b7280', Draw: '#f59e0b', Anchor: '#10b981', Aim: '#3b82f6',
  Release: '#ef4444', 'Follow-Through': '#8b5cf6', Transition: '#9ca3af', Shot: '#6b7280',
};

const SEVERITY_CONFIG = {
  critical: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  warning: { icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  info: { icon: Target, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
};

function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const c = 2 * Math.PI * 18;
  const offset = c - (score / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-12 h-12">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle cx="20" cy="20" r="18" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">{score}</span>
      </div>
      <span className="text-[9px] text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}

function IssueCard({ issue, isExpanded, onToggle }: { issue: FormIssue; isExpanded: boolean; onToggle: () => void }) {
  const cfg = SEVERITY_CONFIG[issue.severity];
  const Icon = cfg.icon;
  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button onClick={onToggle} className="w-full flex items-start gap-2 p-3 text-left">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">{issue.title}</span>
            <Badge variant="outline" className="text-[9px] h-4 px-1">{issue.category}</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{issue.description}</p>
        </div>
        {isExpanded ? <ChevronUp className="w-3 h-3 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />}
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          <div><p className="text-[10px] font-semibold text-primary">Correction:</p><p className="text-[10px] text-muted-foreground">{issue.correction}</p></div>
          {issue.drill && <div><p className="text-[10px] font-semibold text-primary">Drill:</p><p className="text-[10px] text-muted-foreground">{issue.drill}</p></div>}
        </div>
      )}
    </div>
  );
}

import type { ArrowSession } from '@/types';

interface VideoShotAnalysisProps {
  sessions: ArrowSession[];
  onAttachMedia: (sessionId: string, media: { id: string; type: 'video' | 'image'; label: string }) => void;
  addMedia: (blob: Blob, type: 'video' | 'image', opts?: { sessionId?: string; label?: string; thumbnail?: string }) => Promise<{ id: string; type: 'video' | 'image'; size: number; thumbnail?: string; sessionId?: string; date: string; label: string; createdAt: number; url: string }>;
}

export function VideoShotAnalysis({ sessions, onAttachMedia, addMedia }: VideoShotAnalysisProps) {
  const { clips, isRecording, isAnalyzing, analysisProgress, recordingTime, stream, lastError, startRecording, stopRecording, deleteClip } = useVideoAnalysis(addMedia);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(0.5);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const playbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [lastSavedMediaId, setLastSavedMediaId] = useState<string | null>(null);

  const activeClip = clips.find(c => c.id === activeClipId);
  const analysis = activeClip?.poseAnalysis || null;

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
    if (!stream && videoRef.current) videoRef.current.srcObject = null;
  }, [stream]);

  const drawFrame = useCallback((frameIdx: number) => {
    if (!activeClip || frameIdx >= activeClip.frames.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      if (showOverlay && analysis && analysis.framePoses[frameIdx]) {
        const pose = analysis.framePoses[frameIdx];
        if (pose.keypoints.length > 0) drawPoseOverlay(ctx, pose, canvas.width, canvas.height);

        // Phase label
        const phase = analysis.phaseFrames.find(p => frameIdx >= p.start && frameIdx <= p.end);
        if (phase) {
          ctx.fillStyle = (PHASE_COLORS[phase.phase] || '#666') + 'dd';
          const label = phase.phase;
          const tw = ctx.measureText(label).width;
          ctx.fillRect(8, 8, tw + 16, 28);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(label, 16, 28);
        }
      }

      // Frame counter
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(canvas.width - 90, canvas.height - 28, 82, 22);
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.fillText(`${frameIdx + 1}/${activeClip.frames.length}`, canvas.width - 82, canvas.height - 12);
    };
    img.src = activeClip.frames[frameIdx].imageData;
  }, [activeClip, showOverlay, analysis]);

  useEffect(() => {
    if (!isPlaying || !activeClip) return;
    const interval = 1000 / (8 * playbackSpeed);
    playbackRef.current = setInterval(() => {
      setCurrentFrame(prev => {
        if (prev >= (activeClip?.frames.length || 0) - 1) { setIsPlaying(false); return prev; }
        drawFrame(prev + 1);
        return prev + 1;
      });
    }, interval);
    return () => { if (playbackRef.current) clearInterval(playbackRef.current); };
  }, [isPlaying, playbackSpeed, activeClip, drawFrame]);

  useEffect(() => { if (activeClip) drawFrame(currentFrame); }, [activeClip, currentFrame, drawFrame]);

  const handleRecord = async () => {
    if (isRecording) {
      const clip = await stopRecording();
      if (clip) {
        setActiveClipId(clip.id);
        setCurrentFrame(0);
        if (clip.poseAnalysis) {
          const issueCount = clip.poseAnalysis.issues.length;
          if (issueCount > 0) toast.success(`Analysis complete! ${issueCount} form issues found.`);
          else toast.success('Analysis complete! Great form.');
        } else toast.success('Video saved. Analysis unavailable offline.');
      }
    } else {
      const started = await startRecording();
      if (started) toast.success('Recording - up to 90 seconds');
      else toast.error(lastError || 'Camera access denied');
    }
  };

  if (isRecording) return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium flex items-center gap-1.5"><Video className="w-4 h-4 text-primary" /> Recording</h3>
        <Badge variant="destructive" className="text-xs animate-pulse">{(recordingTime / 1000).toFixed(1)}s / 90s</Badge>
      </div>
      <div className="relative rounded-xl overflow-hidden bg-black mb-3 aspect-video">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" /></span>
          <span className="text-white text-xs font-medium drop-shadow">REC</span>
        </div>
      </div>
      <Progress value={(recordingTime / 90000) * 100} className="h-1 mb-3" />
      <Button onClick={handleRecord} className="w-full h-16 rounded-full text-lg font-bold bg-red-500 hover:bg-red-600 animate-pulse"><Square className="w-5 h-5 mr-2" /> Stop</Button>
    </Card>
  );

  if (isAnalyzing) return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center justify-center py-8">
        <div className="text-center space-y-3">
          <Sparkles className="w-8 h-8 text-primary animate-pulse mx-auto" />
          <p className="text-sm font-medium">Running ML pose analysis...</p>
          <Progress value={analysisProgress} className="w-48 h-2" />
          <p className="text-xs text-muted-foreground">Detecting 33 body keypoints per frame</p>
        </div>
      </div>
    </Card>
  );

  if (!activeClip) return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium flex items-center gap-1.5"><User className="w-4 h-4 text-primary" /> AI Form Analysis</h3>
        <Badge variant="secondary" className="text-xs">{clips.length} clips</Badge>
      </div>
      {lastError && (
        <div className="flex items-start gap-2 p-3 mb-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{lastError}</span>
        </div>
      )}
      <Button onClick={handleRecord} className="w-full h-16 rounded-full text-lg font-bold bg-primary hover:bg-primary/90"><Camera className="w-5 h-5 mr-2" /> Record Shot</Button>
      <p className="text-xs text-muted-foreground text-center mt-2">Records your shot, then ML analyzes 33 body keypoints</p>
      {clips.length > 0 && (
        <>
          <Separator className="my-3" />
          <h4 className="text-xs font-medium mb-2">Analyzed Shots</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {clips.map(clip => (
              <button key={clip.id} onClick={() => { setActiveClipId(clip.id); setCurrentFrame(0); }} className="w-full flex items-center gap-2 border rounded-xl p-2 text-left hover:bg-accent transition-colors">
                <div className="w-14 h-14 rounded-lg bg-secondary overflow-hidden shrink-0">
                  {clip.frames[0] && <img src={clip.frames[0].imageData} className="w-full h-full object-cover" alt="" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{clip.date}</p>
                    {clip.poseAnalysis && (
                      <Badge className="text-[9px] h-4 px-1" style={{ background: clip.poseAnalysis.scores.overall >= 70 ? '#10b981' : clip.poseAnalysis.scores.overall >= 45 ? '#f59e0b' : '#ef4444', color: '#fff' }}>
                        {clip.poseAnalysis.scores.overall}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap mt-0.5">
                    {clip.poseAnalysis?.phaseFrames.map(p => (
                      <span key={p.phase} className="text-[9px] px-1 rounded" style={{ background: PHASE_COLORS[p.phase] + '33', color: PHASE_COLORS[p.phase] }}>{p.phase}</span>
                    ))}
                  </div>
                  {clip.poseAnalysis && clip.poseAnalysis.issues.length > 0 && (
                    <p className="text-[9px] text-red-500 mt-0.5">{clip.poseAnalysis.issues.length} issues</p>
                  )}
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={e => { e.stopPropagation(); deleteClip(clip.id); }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );

  return (
    <Card className="p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={() => { setActiveClipId(null); setIsPlaying(false); }}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        <div className="flex gap-1 flex-wrap justify-end">
          {analysis?.phaseFrames.map(p => (
            <button key={p.phase} onClick={() => { setCurrentFrame(p.start); drawFrame(p.start); }} className="px-2 py-0.5 rounded text-[10px] font-medium text-white" style={{ background: PHASE_COLORS[p.phase] }}>{p.phase}</button>
          ))}
        </div>
        <Button size="sm" variant={showOverlay ? 'default' : 'outline'} onClick={() => setShowOverlay(!showOverlay)} className="h-7 text-xs"><Layers className="w-3 h-3 mr-1" />{showOverlay ? 'Skeleton' : 'Off'}</Button>
      </div>

      <div className="relative rounded-xl overflow-hidden bg-black">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setIsPlaying(false); setCurrentFrame(0); drawFrame(0); }}><SkipBack className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setCurrentFrame(Math.max(0, currentFrame - 1)); drawFrame(Math.max(0, currentFrame - 1)); }}><ChevronLeft className="w-4 h-4" /></Button>
          <Button size="sm" className="h-8 w-8 p-0 rounded-full" onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setCurrentFrame(Math.min((activeClip?.frames.length || 1) - 1, currentFrame + 1)); drawFrame(Math.min((activeClip?.frames.length || 1) - 1, currentFrame + 1)); }}><ChevronRight className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setIsPlaying(false); const last = (activeClip?.frames.length || 1) - 1; setCurrentFrame(last); drawFrame(last); }}><SkipForward className="w-4 h-4" /></Button>
          <span className="text-xs text-muted-foreground ml-auto"><Clock className="w-3 h-3 inline mr-0.5" />{activeClip?.frames[currentFrame]?.timestamp || 0}ms</span>
        </div>
        <Slider value={[currentFrame]} max={Math.max(1, (activeClip?.frames.length || 1) - 1)} step={1} onValueChange={([v]) => { setIsPlaying(false); setCurrentFrame(v); drawFrame(v); }} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Speed:</span>
          {[{ label: '0.25x', v: 0.25 }, { label: '0.5x', v: 0.5 }, { label: '1x', v: 1 }].map(s => (
            <Button key={s.v} size="sm" variant={playbackSpeed === s.v ? "default" : "outline"} className="h-7 text-xs px-2" onClick={() => setPlaybackSpeed(s.v)}>{s.label}</Button>
          ))}
        </div>
      </div>

      {analysis && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAnalysis(!showAnalysis)}>
          {showAnalysis ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
          {showAnalysis ? 'Hide' : 'Show'} Form Analysis
          <Badge className="ml-2 text-[9px] h-4" style={{ background: analysis.scores.overall >= 70 ? '#10b981' : analysis.scores.overall >= 45 ? '#f59e0b' : '#ef4444', color: '#fff' }}>{analysis.scores.overall}/100</Badge>
        </Button>
      )}

      {showAnalysis && analysis && (
        <div className="space-y-3">
          <div className="flex items-center gap-4 p-3 rounded-xl bg-accent/50">
            <ScoreRing score={analysis.scores.overall} label="Overall" color={analysis.scores.overall >= 70 ? '#10b981' : analysis.scores.overall >= 45 ? '#f59e0b' : '#ef4444'} />
            <ScoreRing score={analysis.scores.anchorStability} label="Anchor" color="#3b82f6" />
            <ScoreRing score={analysis.scores.releaseQuality} label="Release" color="#ef4444" />
            <ScoreRing score={analysis.scores.followThrough} label="Follow" color="#8b5cf6" />
            <ScoreRing score={analysis.scores.bowArmStability} label="Bow Arm" color="#f59e0b" />
          </div>

          {analysis.strengths.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> What's Working</h4>
              {analysis.strengths.map((s, i) => <p key={i} className="text-[10px] text-muted-foreground pl-4">{s}</p>)}
            </div>
          )}

          {analysis.issues.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold flex items-center gap-1"><Target className="w-3 h-3 text-red-500" /> Issues <Badge variant="outline" className="text-[9px] h-4 ml-1">{analysis.issues.length}</Badge></h4>
              {analysis.issues.map(issue => (
                <IssueCard key={issue.id} issue={issue} isExpanded={expandedIssue === issue.id} onToggle={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)} />
              ))}
            </div>
          )}

          {analysis.phaseFrames.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold flex items-center gap-1"><TrendingUp className="w-3 h-3 text-primary" /> Phase Timeline</h4>
              <div className="flex h-6 rounded-lg overflow-hidden">
                {analysis.phaseFrames.map(p => {
                  const dur = p.end - p.start + 1;
                  const total = activeClip?.frames.length || 1;
                  return <div key={p.phase} className="flex items-center justify-center text-[8px] text-white font-medium" style={{ width: `${(dur / total) * 100}%`, background: PHASE_COLORS[p.phase] }}>{p.phase}</div>;
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Link to session */}
      {activeClip && (
        <div className="space-y-2">
          <Separator />
          <p className="text-xs font-medium">Link this video to a session:</p>
          <div className="flex gap-1 overflow-x-auto">
            {sessions.slice(0, 10).map(s => (
              <Button
                key={s.id}
                size="sm"
                variant="outline"
                className="text-[10px] h-7 shrink-0"
                onClick={() => {
                  onAttachMedia(s.id, { id: activeClip.id, type: 'video', label: 'Form analysis' });
                  toast.success('Video linked to session');
                }}
              >
                {s.date} ({s.arrowCount})
              </Button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
