import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Upload, X, Target, Crosshair, Ruler, MoveHorizontal, MoveVertical, Loader2, Zap, Trash2, RotateCcw, ChevronDown, ChevronUp, ZoomIn, ZoomOut, Hand, MousePointer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useArrowAI, type GroupAnalysis } from '@/hooks/useArrowAI';
import { toast } from 'sonner';

interface ArrowAIAnalyzerProps {
  targetDistance: number;
  onSaveAnalysis?: (analysis: GroupAnalysis) => void;
}

export function ArrowAIAnalyzer({ targetDistance, onSaveAnalysis }: ArrowAIAnalyzerProps) {
  const { detectArrows, isAnalyzing, progress } = useArrowAI();
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<GroupAnalysis | null>(null);
  const calibratedDiameter = 40;
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Array<{x: number; y: number}>>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualArrows, setManualArrows] = useState<Array<{x: number; y: number}>>([]);
  const [selectedArrow, setSelectedArrow] = useState<string | null>(null);

  // Zoom/pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<'place' | 'pan'>('place');
  const viewerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset zoom when new image loaded
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setMode('place');
  }, [imageSrc]);

  // Touch handling for pinch zoom
  const lastTouchDist = useRef<number>(0);

  const takePhoto = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error('Camera not available'); return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      setImageSrc(canvas.toDataURL('image/jpeg', 0.9));
      setAnalysis(null);
      setManualArrows([]);
      toast.success('Photo captured!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Camera failed';
      if (msg.includes('denied') || msg.includes('NotAllowed')) {
        toast.error('Camera permission denied. Enable it in Settings > Apps > Arrow Counter > Permissions.');
      } else if (msg.includes('NotFound')) {
        toast.error('No camera found on this device.');
      } else {
        toast.error('Camera error: ' + msg);
      }
    }
  }, []);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setAnalysis(null);
      setManualArrows([]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const runDetection = useCallback(async () => {
    if (!imageSrc) return;
    try {
      const result = await detectArrows(imageSrc);
      setAnalysis(result);
      toast.success(`Detected ${result.arrows.length} arrows`);
    } catch {
      toast.error('Detection failed. Try manual mode or zoom in.');
    }
  }, [imageSrc, detectArrows]);

  // Transform screen coords to image coords (0-1) accounting for zoom and pan
  const screenToImage = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const viewer = viewerRef.current;
    const img = imageRef.current;
    if (!viewer || !img) return null;
    const rect = viewer.getBoundingClientRect();
    const displayX = (clientX - rect.left - pan.x) / zoom;
    const displayY = (clientY - rect.top - pan.y) / zoom;
    const x = displayX / rect.width;
    const y = displayY / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }, [zoom, pan]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!imageSrc) return;
    if (mode === 'pan') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    // Place mode - add arrow or calibration point
    const coords = screenToImage(e.clientX, e.clientY);
    if (!coords) return;

    if (isCalibrating) {
      const newPoints = [...calibrationPoints, coords];
      if (newPoints.length >= 2) {
        setIsCalibrating(false);
        toast.success('Target calibrated!');
      }
      setCalibrationPoints(newPoints);
      return;
    }
    setManualArrows(prev => [...prev, coords]);
    toast.success('Arrow placed! Zoom in for precision.');
  }, [imageSrc, mode, isCalibrating, calibrationPoints, screenToImage]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning || mode !== 'pan') return;
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  }, [isPanning, mode, panStart]);

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom(z => Math.max(1, Math.min(8, z + delta)));
  }, []);

  // Touch pinch zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastTouchDist.current > 0) {
        const scale = dist / lastTouchDist.current;
        setZoom(z => Math.max(1, Math.min(8, z * scale)));
      }
      lastTouchDist.current = dist;
    }
  }, []);

  const undoManual = useCallback(() => {
    setManualArrows(prev => prev.slice(0, -1));
  }, []);

  const removeArrow = useCallback((arrowId: string) => {
    setAnalysis(prev => {
      if (!prev) return null;
      const newArrows = prev.arrows.filter(a => a.id !== arrowId);
      return { ...prev, arrows: newArrows, outlierArrows: prev.outlierArrows.filter(id => id !== arrowId) };
    });
    setSelectedArrow(null);
  }, []);

  const calibratedSpread = (() => {
    if (!analysis || calibrationPoints.length < 2) return null;
    const dx = calibrationPoints[0].x - calibrationPoints[1].x;
    const dy = calibrationPoints[0].y - calibrationPoints[1].y;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    const cmPerPixel = calibratedDiameter / pixelDist;
    return { maxSpreadCm: analysis.maxSpread * cmPerPixel, avgSpreadCm: analysis.avgSpread * cmPerPixel, cmPerPixel };
  })();

  const sightRecommendations = (() => {
    if (!analysis || analysis.arrows.length < 3) return null;
    const dx = analysis.groupCenter.x - 0.5;
    const dy = analysis.groupCenter.y - 0.5;
    const recs: Array<{type: 'horizontal' | 'vertical'; direction: string; clicks: number}> = [];
    if (Math.abs(dx) > 0.03) recs.push({ type: 'horizontal', direction: dx > 0 ? 'LEFT (windage)' : 'RIGHT (windage)', clicks: Math.round(Math.abs(dx) * 100) });
    if (Math.abs(dy) > 0.03) recs.push({ type: 'vertical', direction: dy > 0 ? 'UP (elevation)' : 'DOWN (elevation)', clicks: Math.round(Math.abs(dy) * 100) });
    return recs;
  })();

  const extrapolation = (() => {
    if (!analysis || analysis.moa === 0) return null;
    const distances = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    return distances.map(d => ({ distance: d, groupSize: Math.round((analysis.moa * d / 100 * 1.047) * 100) / 100, scorePotential: analysis.moa * d / 100 < 0.5 ? 'Excellent' : analysis.moa * d / 100 < 1.0 ? 'Good' : analysis.moa * d / 100 < 2.0 ? 'Fair' : 'Poor' }));
  })();

  const groupQuality = (() => {
    if (!analysis) return null;
    if (analysis.moa < 1) return { label: 'Competition Grade', color: 'text-emerald-500', bg: 'bg-emerald-50' };
    if (analysis.moa < 2) return { label: 'Excellent', color: 'text-green-500', bg: 'bg-green-50' };
    if (analysis.moa < 4) return { label: 'Good', color: 'text-yellow-500', bg: 'bg-yellow-50' };
    if (analysis.moa < 6) return { label: 'Fair', color: 'text-orange-500', bg: 'bg-orange-50' };
    return { label: 'Needs Work', color: 'text-red-500', bg: 'bg-red-50' };
  })();

  // Combine auto-detected + manual arrows for display
  const allArrows = [
    ...(analysis?.arrows || []),
    ...manualArrows.map((pos, i) => ({ id: `manual-${i}`, x: pos.x, y: pos.y, radius: 0.015, confidence: 1.0, scoreRing: 'M' as string | undefined })),
  ];

  return (
    <Card className="p-4 rounded-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-primary" /> AI Arrow Analyzer
        </h3>
        {analysis && (
          <Badge variant="default" className="text-xs">{analysis.arrows.length} auto + {manualArrows.length} manual</Badge>
        )}
      </div>

      {/* Image viewer with zoom/pan */}
      {imageSrc && (
        <>
          <div
            ref={viewerRef}
            className={`relative rounded-xl overflow-hidden border bg-black select-none ${mode === 'place' ? 'cursor-crosshair' : isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ touchAction: 'none', userSelect: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
          >
            <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', transition: isPanning ? 'none' : 'transform 0.1s' }}>
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Target"
                className="w-full block"
                draggable={false}
              />
              {/* Overlay layers - transformed with zoom */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Group center */}
                {analysis && (
                  <div className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2" style={{ left: `${analysis.groupCenter.x * 100}%`, top: `${analysis.groupCenter.y * 100}%` }}>
                    <Crosshair className="w-5 h-5 text-primary/70" />
                  </div>
                )}
                {/* Auto-detected arrows */}
                {analysis?.arrows.map(arrow => (
                  <button
                    key={arrow.id}
                    onClick={(e) => { e.stopPropagation(); setSelectedArrow(selectedArrow === arrow.id ? null : arrow.id); }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all hover:scale-125 pointer-events-auto ${
                      selectedArrow === arrow.id ? 'border-red-500 bg-red-500/30 w-7 h-7 z-10' :
                      arrow.scoreRing === 'X' ? 'border-red-500 bg-red-500/20 w-4 h-4' :
                      arrow.scoreRing === '10' ? 'border-yellow-500 bg-yellow-500/20 w-4 h-4' :
                      'border-primary bg-primary/20 w-3.5 h-3.5'
                    }`}
                    style={{ left: `${arrow.x * 100}%`, top: `${arrow.y * 100}%` }}
                  >
                    <span className="text-[7px] font-bold text-white drop-shadow">{arrow.scoreRing}</span>
                  </button>
                ))}
                {/* Manual arrows */}
                {manualArrows.map((pos, i) => (
                  <div key={`m-${i}`} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-purple-500 bg-purple-500/30 w-4 h-4" style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}>
                    <span className="text-[7px] font-bold text-white">M</span>
                  </div>
                ))}
                {/* Calibration points */}
                {calibrationPoints.map((pt, i) => (
                  <div key={`cal-${i}`} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-400 bg-cyan-400/50 w-3 h-3" style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }} />
                ))}
                {/* Calibration line */}
                {calibrationPoints.length >= 2 && (
                  <svg className="absolute inset-0 w-full h-full">
                    <line x1={`${calibrationPoints[0].x * 100}%`} y1={`${calibrationPoints[0].y * 100}%`}
                      x2={`${calibrationPoints[1].x * 100}%`} y2={`${calibrationPoints[1].y * 100}%`}
                      stroke="#22d3ee" strokeWidth="2" strokeDasharray="4" />
                  </svg>
                )}
              </div>
            </div>

            {/* Zoom level indicator */}
            {zoom > 1 && (
              <div className="absolute top-2 right-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full">
                {Math.round(zoom * 100)}%
              </div>
            )}
          </div>

          {/* Zoom and mode controls */}
          <div className="flex items-center gap-2">
            <Button size="sm" variant={mode === 'place' ? 'default' : 'outline'} onClick={() => setMode('place')} className="h-8 text-xs">
              <MousePointer className="w-3 h-3 mr-1" /> Place
            </Button>
            <Button size="sm" variant={mode === 'pan' ? 'default' : 'outline'} onClick={() => setMode('pan')} className="h-8 text-xs">
              <Hand className="w-3 h-3 mr-1" /> Pan
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            <Button size="sm" variant="outline" onClick={() => setZoom(z => Math.min(8, z + 0.5))} className="h-8 w-8 p-0">
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setZoom(z => Math.max(1, z - 0.5))} className="h-8 w-8 p-0">
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="h-8 text-[10px]">
              Reset
            </Button>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {mode === 'place' ? 'Tap to place arrow' : 'Drag to pan, pinch/wheel to zoom'}
            </span>
          </div>
        </>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={takePhoto} className="rounded-full"><Camera className="w-4 h-4 mr-1" /> Camera</Button>
        <Button size="sm" variant="outline" onClick={() => document.getElementById('ai-upload')?.click()} className="rounded-full"><Upload className="w-4 h-4 mr-1" /> Upload</Button>
        <input id="ai-upload" type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        {imageSrc && (
          <>
            <Button size="sm" onClick={runDetection} disabled={isAnalyzing} className="rounded-full">
              {isAnalyzing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
              {isAnalyzing ? `${progress}%` : 'Analyze'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsCalibrating(!isCalibrating)} className={`rounded-full ${isCalibrating ? 'bg-cyan-100' : ''}`}>
              <Ruler className="w-4 h-4 mr-1" /> {isCalibrating ? 'Tap 2 pts' : 'Calibrate'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setImageSrc(null); setAnalysis(null); setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded-full"><X className="w-4 h-4" /></Button>
          </>
        )}
      </div>

      {isAnalyzing && <Progress value={progress} className="h-1.5" />}

      {/* Results */}
      {analysis && analysis.arrows.length > 0 && (
        <div className="space-y-3">
          {groupQuality && (
            <div className={`${groupQuality.bg} rounded-xl p-3 text-center`}>
              <p className={`text-lg font-bold ${groupQuality.color}`}>{groupQuality.label}</p>
              <p className="text-xs text-muted-foreground">{analysis.moa} MOA @ {targetDistance}yd</p>
            </div>
          )}
          {analysis.scoreEstimate && (
            <div className="flex items-center justify-between bg-secondary/50 rounded-xl p-3">
              <div className="text-center flex-1"><p className="text-2xl font-bold text-primary">{analysis.scoreEstimate.total}</p><p className="text-[10px] text-muted-foreground uppercase">Total</p></div>
              <Separator orientation="vertical" className="h-8" />
              <div className="text-center flex-1"><p className="text-2xl font-bold text-red-500">{analysis.scoreEstimate.xCount}</p><p className="text-[10px] text-muted-foreground uppercase">X-Ring</p></div>
              <Separator orientation="vertical" className="h-8" />
              <div className="text-center flex-1"><p className="text-2xl font-bold">{allArrows.length}</p><p className="text-[10px] text-muted-foreground uppercase">Arrows</p></div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-secondary/50 rounded-lg p-2 text-center"><p className="text-lg font-bold">{analysis.maxSpread}"</p><p className="text-[10px] text-muted-foreground">Max Spread</p></div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center"><p className="text-lg font-bold">{analysis.avgSpread}"</p><p className="text-[10px] text-muted-foreground">Avg Spread</p></div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center"><p className="text-lg font-bold">{analysis.moa}</p><p className="text-[10px] text-muted-foreground">MOA</p></div>
          </div>
          {calibratedSpread && (
            <div className="bg-cyan-50 dark:bg-cyan-950/30 rounded-xl p-3">
              <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 flex items-center gap-1"><Ruler className="w-3 h-3" /> Calibrated ({calibratedDiameter}cm target)</p>
              <div className="flex gap-4 mt-1"><span className="text-sm">{Math.round(calibratedSpread.maxSpreadCm * 10) / 10}cm max</span><span className="text-sm">{Math.round(calibratedSpread.avgSpreadCm * 10) / 10}cm avg</span></div>
            </div>
          )}
          {sightRecommendations && sightRecommendations.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1 mb-1"><Target className="w-3 h-3" /> Sight Adjustment</p>
              {sightRecommendations.map((rec, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {rec.type === 'horizontal' ? <MoveHorizontal className="w-3.5 h-3.5" /> : <MoveVertical className="w-3.5 h-3.5" />}
                  <span className="font-medium">{rec.direction}</span><span className="text-muted-foreground">~{rec.clicks} clicks</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {analysis.arrows.map(a => (
              <button key={a.id} onClick={() => setSelectedArrow(selectedArrow === a.id ? null : a.id)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all ${selectedArrow === a.id ? 'bg-red-100 text-red-700 ring-1 ring-red-300' : a.scoreRing === 'X' ? 'bg-red-100 text-red-700' : a.scoreRing === '10' ? 'bg-yellow-100 text-yellow-700' : 'bg-secondary'}`}>
                {a.scoreRing || '?'} ({Math.round(a.confidence * 100)}%)
                {selectedArrow === a.id && (<span onClick={(e) => { e.stopPropagation(); removeArrow(a.id); }} className="ml-0.5"><Trash2 className="w-3 h-3" /></span>)}
              </button>
            ))}
            {manualArrows.length > 0 && (
              <Badge variant="outline" className="text-xs">+{manualArrows.length} manual</Badge>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setShowAdvanced(!showAdvanced)} className="w-full text-xs">
            {showAdvanced ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}Advanced
          </Button>
          {showAdvanced && extrapolation && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Predicted group sizes:</p>
              <div className="grid grid-cols-5 gap-1">
                {extrapolation.map(e => (
                  <div key={e.distance} className={`text-center rounded-lg p-1.5 text-xs ${e.scorePotential === 'Excellent' ? 'bg-emerald-50' : e.scorePotential === 'Good' ? 'bg-green-50' : e.scorePotential === 'Fair' ? 'bg-yellow-50' : 'bg-red-50'}`}>
                    <p className="font-bold">{e.distance}yd</p><p className="text-muted-foreground">{e.groupSize}"</p>
                    <p className={`text-[9px] font-medium ${e.scorePotential === 'Excellent' ? 'text-emerald-600' : e.scorePotential === 'Good' ? 'text-green-600' : e.scorePotential === 'Fair' ? 'text-yellow-600' : 'text-red-600'}`}>{e.scorePotential}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={undoManual} className="text-xs flex-1"><RotateCcw className="w-3 h-3 mr-1" /> Undo Manual</Button>
            <Button size="sm" variant="outline" onClick={() => setIsCalibrating(!isCalibrating)} className="text-xs flex-1"><Ruler className="w-3 h-3 mr-1" /> {isCalibrating ? 'Done' : 'Re-Cal'}</Button>
            {onSaveAnalysis && <Button size="sm" onClick={() => { onSaveAnalysis(analysis); toast.success('Saved!'); }} className="text-xs flex-1">Save</Button>}
          </div>
        </div>
      )}
    </Card>
  );
}
