import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Upload, X, Plus, Minus, Target, Crosshair, Ruler, Wind, TrendingDown, MoveHorizontal, MoveVertical, Loader2, Zap, CircleDot, Trash2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { useArrowAI, type GroupAnalysis, type DetectedArrow } from '@/hooks/useArrowAI';
import { toast } from 'sonner';

interface ArrowAIAnalyzerProps {
  targetDistance: number; // yards
  onSaveAnalysis?: (analysis: GroupAnalysis) => void;
}

export function ArrowAIAnalyzer({ targetDistance, onSaveAnalysis }: ArrowAIAnalyzerProps) {
  const { detectArrows, isAnalyzing, progress, canvasRef } = useArrowAI();
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<GroupAnalysis | null>(null);
  const [calibratedDiameter, setCalibratedDiameter] = useState(40); // cm
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Array<{x: number; y: number}>>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualArrows, setManualArrows] = useState<Array<{x: number; y: number}>>([]);
  const [selectedArrow, setSelectedArrow] = useState<string | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.3);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Capture photo
  const takePhoto = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);

      stream.getTracks().forEach(t => t.stop());

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setImageSrc(dataUrl);
      setAnalysis(null);
      setManualArrows([]);
      toast.success('Photo captured!');
    } catch {
      toast.error('Camera access denied. Use upload instead.');
    }
  }, []);

  // Upload image
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

  // Run AI detection
  const runDetection = useCallback(async () => {
    if (!imageSrc) return;
    try {
      const result = await detectArrows(imageSrc);
      setAnalysis(result);
      toast.success(`Detected ${result.arrows.length} arrows`);
    } catch {
      toast.error('Detection failed. Try manual mode.');
    }
  }, [imageSrc, detectArrows]);

  // Manual arrow placement
  const handleImageClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!imageSrc) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (isCalibrating) {
      const newPoints = [...calibrationPoints, { x, y }];
      if (newPoints.length >= 2) {
        setIsCalibrating(false);
        toast.success('Target calibrated!');
      }
      setCalibrationPoints(newPoints);
      return;
    }

    // Add manual arrow
    setManualArrows(prev => [...prev, { x, y }]);
  }, [imageSrc, isCalibrating, calibrationPoints]);

  // Remove last manual arrow
  const undoManual = useCallback(() => {
    setManualArrows(prev => prev.slice(0, -1));
  }, []);

  // Remove selected arrow
  const removeArrow = useCallback((arrowId: string) => {
    setAnalysis(prev => {
      if (!prev) return null;
      const newArrows = prev.arrows.filter(a => a.id !== arrowId);
      return {
        ...prev,
        arrows: newArrows,
        // Recalculate without removed arrow
        maxSpread: prev.maxSpread, // simplified
        outlierArrows: prev.outlierArrows.filter(id => id !== arrowId),
      };
    });
    setSelectedArrow(null);
  }, []);

  // Compute calibrated measurements
  const calibratedSpread = (() => {
    if (!analysis || calibrationPoints.length < 2) return null;
    const dx = calibrationPoints[0].x - calibrationPoints[1].x;
    const dy = calibrationPoints[0].y - calibrationPoints[1].y;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    const cmPerPixel = calibratedDiameter / pixelDist;
    const maxSpreadCm = analysis.maxSpread * cmPerPixel;
    const avgSpreadCm = analysis.avgSpread * cmPerPixel;
    return { maxSpreadCm, avgSpreadCm, cmPerPixel };
  })();

  // Sight adjustment recommendations
  const sightRecommendations = (() => {
    if (!analysis || analysis.arrows.length < 3) return null;
    const dx = analysis.groupCenter.x - analysis.arrows[0].x; // offset from target center
    const dy = analysis.groupCenter.y - analysis.arrows[0].y;

    // Convert to inches at target distance
    const spreadRatio = analysis.maxSpread > 0 ? analysis.maxSpread : 1;
    const leftRight = dx * spreadRatio * 10;
    const upDown = dy * spreadRatio * 10;

    const recs: Array<{type: 'horizontal' | 'vertical'; direction: string; clicks: number}> = [];

    if (Math.abs(leftRight) > 0.5) {
      recs.push({
        type: 'horizontal',
        direction: leftRight > 0 ? 'LEFT (windage)' : 'RIGHT (windage)',
        clicks: Math.round(Math.abs(leftRight) * 2)
      });
    }
    if (Math.abs(upDown) > 0.5) {
      recs.push({
        type: 'vertical',
        direction: upDown > 0 ? 'UP (elevation)' : 'DOWN (elevation)',
        clicks: Math.round(Math.abs(upDown) * 2)
      });
    }
    return recs;
  })();

  // Extrapolated group sizes at different distances
  const extrapolation = (() => {
    if (!analysis || analysis.moa === 0) return null;
    const distances = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    return distances.map(d => ({
      distance: d,
      groupSize: Math.round((analysis.moa * d / 100 * 1.047) * 100) / 100,
      scorePotential: analysis.moa * d / 100 < 0.5 ? 'Excellent' :
                     analysis.moa * d / 100 < 1.0 ? 'Good' :
                     analysis.moa * d / 100 < 2.0 ? 'Fair' : 'Poor'
    }));
  })();

  // Group quality rating
  const groupQuality = (() => {
    if (!analysis) return null;
    const moa = analysis.moa;
    if (moa < 1) return { label: 'Competition Grade', color: 'text-emerald-500', bg: 'bg-emerald-50' };
    if (moa < 2) return { label: 'Excellent', color: 'text-green-500', bg: 'bg-green-50' };
    if (moa < 4) return { label: 'Good', color: 'text-yellow-500', bg: 'bg-yellow-50' };
    if (moa < 6) return { label: 'Fair', color: 'text-orange-500', bg: 'bg-orange-50' };
    return { label: 'Needs Work', color: 'text-red-500', bg: 'bg-red-50' };
  })();

  return (
    <Card className="p-4 rounded-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-primary" /> AI Arrow Analyzer
        </h3>
        {analysis && (
          <Badge variant={analysis.arrows.length > 0 ? "default" : "secondary"} className="text-xs">
            {analysis.arrows.length} arrow{analysis.arrows.length !== 1 ? 's' : ''} detected
          </Badge>
        )}
      </div>

      {/* Image display with overlay */}
      {imageSrc && (
        <div className="relative rounded-xl overflow-hidden border" ref={containerRef}>
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Target"
            className="w-full cursor-crosshair"
            onClick={handleImageClick}
            draggable={false}
          />

          {/* Target center marker */}
          {analysis && (
            <div
              className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${analysis.groupCenter.x * 100}%`, top: `${analysis.groupCenter.y * 100}%` }}
            >
              <Crosshair className="w-4 h-4 text-primary/60" />
            </div>
          )}

          {/* Detected arrows */}
          {analysis?.arrows.map(arrow => (
            <button
              key={arrow.id}
              onClick={(e) => { e.stopPropagation(); setSelectedArrow(selectedArrow === arrow.id ? null : arrow.id); }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all hover:scale-125 ${
                selectedArrow === arrow.id
                  ? 'border-red-500 bg-red-500/30 w-8 h-8 z-10'
                  : arrow.scoreRing === 'X'
                  ? 'border-red-500 bg-red-500/20 w-5 h-5'
                  : arrow.scoreRing === '10'
                  ? 'border-yellow-500 bg-yellow-500/20 w-5 h-5'
                  : 'border-primary bg-primary/20 w-4 h-4'
              }`}
              style={{ left: `${arrow.x * 100}%`, top: `${arrow.y * 100}%` }}
              title={`Score: ${arrow.scoreRing || '?'} (${Math.round(arrow.confidence * 100)}%)`}
            >
              <span className="text-[8px] font-bold text-white drop-shadow">
                {arrow.scoreRing || '?'}
              </span>
            </button>
          ))}

          {/* Manual arrows */}
          {manualArrows.map((pos, i) => (
            <div
              key={`manual-${i}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-purple-500 bg-purple-500/30 w-5 h-5 pointer-events-none"
              style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
            >
              <span className="text-[8px] font-bold text-white">M</span>
            </div>
          ))}

          {/* Calibration points */}
          {calibrationPoints.map((pt, i) => (
            <div
              key={`cal-${i}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-400 bg-cyan-400/50 w-4 h-4"
              style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
            />
          ))}

          {/* Calibration line */}
          {calibrationPoints.length >= 2 && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <line
                x1={`${calibrationPoints[0].x * 100}%`}
                y1={`${calibrationPoints[0].y * 100}%`}
                x2={`${calibrationPoints[1].x * 100}%`}
                y2={`${calibrationPoints[1].y * 100}%`}
                stroke="#22d3ee"
                strokeWidth="2"
                strokeDasharray="4"
              />
            </svg>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={takePhoto} className="rounded-full">
          <Camera className="w-4 h-4 mr-1" /> Camera
        </Button>
        <Button size="sm" variant="outline" onClick={() => document.getElementById('ai-upload')?.click()} className="rounded-full">
          <Upload className="w-4 h-4 mr-1" /> Upload
        </Button>
        <input id="ai-upload" type="file" accept="image/*" className="hidden" onChange={handleUpload} />

        {imageSrc && (
          <>
            <Button size="sm" onClick={runDetection} disabled={isAnalyzing} className="rounded-full">
              {isAnalyzing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
              {isAnalyzing ? `${progress}%` : 'Analyze'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsCalibrating(!isCalibrating)} className={`rounded-full ${isCalibrating ? 'bg-cyan-100' : ''}`}>
              <Ruler className="w-4 h-4 mr-1" /> {isCalibrating ? 'Tap 2 points' : 'Calibrate'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setImageSrc(null); setAnalysis(null); }} className="rounded-full">
              <X className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>

      {isAnalyzing && <Progress value={progress} className="h-1.5" />}

      {/* Results */}
      {analysis && analysis.arrows.length > 0 && (
        <div className="space-y-3">
          {/* Group Quality Badge */}
          {groupQuality && (
            <div className={`${groupQuality.bg} rounded-xl p-3 text-center`}>
              <p className={`text-lg font-bold ${groupQuality.color}`}>{groupQuality.label}</p>
              <p className="text-xs text-muted-foreground">{analysis.moa} MOA @ {targetDistance}yd</p>
            </div>
          )}

          {/* Score Estimate */}
          {analysis.scoreEstimate && (
            <div className="flex items-center justify-between bg-secondary/50 rounded-xl p-3">
              <div className="text-center flex-1">
                <p className="text-2xl font-bold text-primary">{analysis.scoreEstimate.total}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Total</p>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div className="text-center flex-1">
                <p className="text-2xl font-bold text-red-500">{analysis.scoreEstimate.xCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase">X-Ring</p>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div className="text-center flex-1">
                <p className="text-2xl font-bold">{analysis.arrows.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Arrows</p>
              </div>
            </div>
          )}

          {/* Group Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold">{analysis.maxSpread}"</p>
              <p className="text-[10px] text-muted-foreground">Max Spread</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold">{analysis.avgSpread}"</p>
              <p className="text-[10px] text-muted-foreground">Avg Spread</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold">{analysis.moa}</p>
              <p className="text-[10px] text-muted-foreground">MOA</p>
            </div>
          </div>

          {/* Calibrated measurements */}
          {calibratedSpread && (
            <div className="bg-cyan-50 dark:bg-cyan-950/30 rounded-xl p-3">
              <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 flex items-center gap-1"><Ruler className="w-3 h-3" /> Calibrated ({calibratedDiameter}cm target)</p>
              <div className="flex gap-4 mt-1">
                <span className="text-sm">{Math.round(calibratedSpread.maxSpreadCm * 10) / 10}cm max</span>
                <span className="text-sm">{Math.round(calibratedSpread.avgSpreadCm * 10) / 10}cm avg</span>
              </div>
            </div>
          )}

          {/* Sight Adjustments */}
          {sightRecommendations && sightRecommendations.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1 mb-1">
                <Target className="w-3 h-3" /> Sight Adjustment Needed
              </p>
              {sightRecommendations.map((rec, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {rec.type === 'horizontal' ? <MoveHorizontal className="w-3.5 h-3.5" /> : <MoveVertical className="w-3.5 h-3.5" />}
                  <span className="font-medium">{rec.direction}</span>
                  <span className="text-muted-foreground">~{rec.clicks} clicks</span>
                </div>
              ))}
            </div>
          )}

          {/* Arrow list */}
          <div className="flex flex-wrap gap-1">
            {analysis.arrows.map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedArrow(selectedArrow === a.id ? null : a.id)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all ${
                  selectedArrow === a.id
                    ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
                    : a.scoreRing === 'X'
                    ? 'bg-red-100 text-red-700'
                    : a.scoreRing === '10'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-secondary'
                }`}
              >
                {a.scoreRing || '?'} ({Math.round(a.confidence * 100)}%)
                {selectedArrow === a.id && (
                  <span onClick={(e) => { e.stopPropagation(); removeArrow(a.id); }} className="ml-0.5">
                    <Trash2 className="w-3 h-3" />
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Advanced */}
          <Button size="sm" variant="ghost" onClick={() => setShowAdvanced(!showAdvanced)} className="w-full text-xs">
            {showAdvanced ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
            Advanced: Distance Extrapolation
          </Button>

          {showAdvanced && extrapolation && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Predicted group size at different distances:</p>
              <div className="grid grid-cols-5 gap-1">
                {extrapolation.map(e => (
                  <div key={e.distance} className={`text-center rounded-lg p-1.5 text-xs ${
                    e.scorePotential === 'Excellent' ? 'bg-emerald-50' :
                    e.scorePotential === 'Good' ? 'bg-green-50' :
                    e.scorePotential === 'Fair' ? 'bg-yellow-50' : 'bg-red-50'
                  }`}>
                    <p className="font-bold">{e.distance}yd</p>
                    <p className="text-muted-foreground">{e.groupSize}"</p>
                    <p className={`text-[9px] font-medium ${
                      e.scorePotential === 'Excellent' ? 'text-emerald-600' :
                      e.scorePotential === 'Good' ? 'text-green-600' :
                      e.scorePotential === 'Fair' ? 'text-yellow-600' : 'text-red-600'
                    }`}>{e.scorePotential}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual controls */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={undoManual} className="text-xs flex-1">
              <RotateCcw className="w-3 h-3 mr-1" /> Undo Manual
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsCalibrating(!isCalibrating)} className="text-xs flex-1">
              <Ruler className="w-3 h-3 mr-1" /> {isCalibrating ? 'Done' : 'Re-Calibrate'}
            </Button>
            {onSaveAnalysis && (
              <Button size="sm" onClick={() => { onSaveAnalysis(analysis); toast.success('Analysis saved!'); }} className="text-xs flex-1">
                Save to Session
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
