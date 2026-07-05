"use client";

import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ArrowImpact, GroupStats, CalibratedTarget, Point } from '@/types/archery';
import { calculateGroupStats, detectArrowHolesHeuristic, predictTrend, inchesToMOA } from '@/utils/groupAnalysis';
import { Upload, Target, Zap, TrendingUp, Download, Trash2, Plus } from 'lucide-react';

// Auto Group ML Analyzer - the core photo-to-stats engine
// Integrates with WalkbackTuner and tuningAnalysis for full advanced tuning workflow

interface Props {
  onSaveGroup?: (stats: GroupStats, impacts: ArrowImpact[], imageDataUrl: string) => void;
  historicalSessions?: any[];
  distanceYards?: number;
}

export const AutoGroupMLAnalyzer: React.FC<Props> = ({
  onSaveGroup,
  historicalSessions = [],
  distanceYards = 20,
}) => {
  const [image, setImage] = useState<string | null>(null);
  const [impacts, setImpacts] = useState<ArrowImpact[]>([]);
  const [calibrated, setCalibrated] = useState<CalibratedTarget | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [detectionDebug, setDetectionDebug] = useState('');
  const [sensitivity, setSensitivity] = useState(40);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showEllipse, setShowEllipse] = useState(true);
  const [manualMode, setManualMode] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(new Image());

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx || !image) return;

    const img = imageRef.current;
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      if (calibrated) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(calibrated.center.x, calibrated.center.y, 
                (calibrated.diameterInches * calibrated.pixelsPerInch) / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#22c55e';
        ctx.fillText('CALIBRATED', calibrated.center.x - 40, calibrated.center.y - 20);
      }

      impacts.forEach((imp, idx) => {
        const { x, y } = imp.point;
        ctx.fillStyle = imp.isOutlier ? '#ef4444' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText((idx + 1).toString(), x - 4, y + 4);
      });

      if (impacts.length > 1 && calibrated) {
        const stats = calculateGroupStats(impacts, calibrated);
        const { center } = stats;

        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(center.x - 15, center.y);
        ctx.lineTo(center.x + 15, center.y);
        ctx.moveTo(center.x, center.y - 15);
        ctx.lineTo(center.x, center.y + 15);
        ctx.stroke();

        if (showEllipse) {
          const ppi = calibrated.pixelsPerInch;
          const rx = (stats.groupSize95PercentInches * ppi) * 1.2;
          const ry = rx * 0.7;
          ctx.strokeStyle = '#a855f7';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (Math.abs(stats.windageBiasInches) > 0.3) {
          const biasPx = stats.windageBiasInches * ppi;
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(center.x, center.y);
          ctx.lineTo(center.x + biasPx * 0.8, center.y - 30);
          ctx.stroke();
          ctx.fillStyle = '#f97316';
          ctx.fillText(`WINDAGE ${stats.windageBiasInches.toFixed(1)}"`, center.x + biasPx * 0.8 + 5, center.y - 35);
        }
      }
    };
    if (image) img.src = image;
  }, [image, impacts, calibrated, showEllipse]);

  React.useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setImage(dataUrl);
      setImpacts([]);
      setCalibrated(null);
      setDetectionDebug('');
      imageRef.current.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    if (isCalibrating && !calibrated) {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const dist = Math.sqrt(Math.pow(clickX - centerX, 2) + Math.pow(clickY - centerY, 2));
      const assumedDiameterInches = 31.5; // 80cm common
      const ppi = (dist * 2) / assumedDiameterInches;

      const newCal: CalibratedTarget = {
        diameterInches: assumedDiameterInches,
        center: { x: centerX, y: centerY },
        pixelsPerInch: ppi,
        imageWidth: canvas.width,
        imageHeight: canvas.height,
        targetType: '80cm',
      };
      setCalibrated(newCal);
      setIsCalibrating(false);
      alert(`Calibration set! Diameter ${assumedDiameterInches}", PPI: ${ppi.toFixed(1)}. Now add impacts or auto-detect.`);
    } else if (manualMode) {
      const newImpact: ArrowImpact = {
        id: `manual-${Date.now()}`,
        point: { x: clickX, y: clickY },
        confidence: 1.0,
        isOutlier: false,
      };
      setImpacts(prev => [...prev, newImpact]);
    }
  };

  const runAutoDetection = async () => {
    if (!image || !canvasRef.current) return;
    setIsProcessing(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const img = imageRef.current;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const result = detectArrowHolesHeuristic(imageData, calibrated?.center, sensitivity);
    setDetectionDebug(result.debugInfo);

    const newImpacts: ArrowImpact[] = result.points.map((pt, i) => ({
      id: `auto-${Date.now()}-${i}`,
      point: pt,
      confidence: 0.75,
      isOutlier: false,
    }));

    setImpacts(newImpacts);
    setIsProcessing(false);

    if (calibrated && newImpacts.length > 0) {
      const stats = calculateGroupStats(newImpacts, calibrated);
      console.log('Auto Group Stats:', stats);
    }
  };

  const currentStats: GroupStats | null = calibrated && impacts.length > 0 
    ? calculateGroupStats(impacts, calibrated) 
    : null;

  const trend = historicalSessions.length > 0 
    ? predictTrend(historicalSessions.map((s, i) => ({ sessionNum: i, groupMOA: s.overallStats?.diameterMOA || 4 })))
    : null;

  const handleSave = () => {
    if (!currentStats || !image) return;
    onSaveGroup?.(currentStats, impacts, image);
    alert('Group saved to session history. ML trend updated.');
  };

  const clearAll = () => {
    setImpacts([]);
    setCalibrated(null);
    setDetectionDebug('');
    setImage(null);
  };

  const removeLastImpact = () => {
    setImpacts(prev => prev.slice(0, -1));
  };

  return (
    <div className="space-y-6 p-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Target className="h-8 w-8 text-primary" /> AUTO GROUP ML ANALYZER
          </h2>
          <p className="text-muted-foreground">Photo → Auto Detect Arrows → Real Stats + ML Predictions. Foundation for advanced tuning.</p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-1">v2.0 ML + CV</Badge>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => fileInputRef.current?.click()} size="lg" className="gap-2">
          <Upload className="h-5 w-5" /> Upload Target Photo
        </Button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

        <Button 
          onClick={() => { setIsCalibrating(true); setManualMode(false); }} 
          variant="outline" 
          size="lg"
          disabled={!image}
          className="gap-2"
        >
          <Target className="h-5 w-5" /> Calibrate (Tap Edge)
        </Button>

        <Button 
          onClick={runAutoDetection} 
          disabled={!image || isProcessing} 
          size="lg" 
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
        >
          <Zap className="h-5 w-5" /> {isProcessing ? 'DETECTING...' : 'AUTO DETECT ARROWS (CV/ML)'}
        </Button>

        <Button onClick={() => setManualMode(!manualMode)} variant={manualMode ? "default" : "outline"} size="lg">
          {manualMode ? 'Exit Manual Mark' : 'Manual Mark Impacts'}
        </Button>

        <Button onClick={clearAll} variant="destructive" size="lg" className="gap-2">
          <Trash2 className="h-5 w-5" /> Clear
        </Button>
      </div>

      {image && (
        <div className="flex items-center gap-4 bg-muted/50 p-3 rounded-lg">
          <Label className="min-w-[120px]">Detection Sensitivity</Label>
          <Slider 
            value={[sensitivity]} 
            onValueChange={(v) => setSensitivity(v[0])} 
            min={10} max={120} step={5}
            className="w-64"
          />
          <span className="font-mono w-12">{sensitivity}</span>
          <span className="text-xs text-muted-foreground">Lower = stricter dark blobs</span>
        </div>
      )}

      <Card className="overflow-hidden border-2 border-primary/20">
        <CardContent className="p-0 relative">
          {!image ? (
            <div className="h-[420px] flex flex-col items-center justify-center bg-muted/30 text-center p-8">
              <Target className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <p className="text-xl font-semibold mb-2">Upload a clear photo of your target</p>
              <p className="text-muted-foreground max-w-md">
                Best results: good lighting, straight on. Then calibrate diameter, auto detect holes, get instant group stats + ML insights. Feeds directly into WalkbackTuner.
              </p>
            </div>
          ) : (
            <div className="relative">
              <canvas 
                ref={canvasRef} 
                onClick={handleCanvasClick}
                className="w-full h-auto max-h-[520px] cursor-crosshair border-b"
              />
              {isCalibrating && (
                <div className="absolute top-4 left-4 bg-black/80 text-white px-4 py-2 rounded text-sm">
                  CLICK ON THE TARGET EDGE to set real-world diameter scale
                </div>
              )}
              {manualMode && (
                <div className="absolute top-4 left-4 bg-black/80 text-white px-4 py-2 rounded text-sm">
                  CLICK to manually add arrow impacts.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {detectionDebug && (
        <div className="text-sm font-mono bg-muted p-3 rounded border-l-4 border-primary">
          {detectionDebug}
        </div>
      )}

      {currentStats && calibrated && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Target /> GROUP STATS (Auto)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-lg">
              <div className="flex justify-between"><span>Arrows Detected</span><span className="font-mono font-bold">{currentStats.arrowCount}</span></div>
              <div className="flex justify-between"><span>Group Diameter</span><span className="font-mono font-bold">{currentStats.maxRadiusInches.toFixed(2)}"</span></div>
              <div className="flex justify-between"><span>Mean Radius</span><span className="font-mono">{currentStats.meanRadiusInches.toFixed(2)}"</span></div>
              <div className="flex justify-between"><span>95% Group Size</span><span className="font-mono">{currentStats.groupSize95PercentInches.toFixed(2)}"</span></div>
              <div className="flex justify-between border-t pt-3"><span className="font-semibold">QUALITY SCORE</span><span className="font-mono text-3xl font-bold text-primary">{currentStats.qualityScore}</span></div>
              <div className="flex justify-between"><span>Windage Bias</span><span className={`font-mono ${currentStats.windageBiasInches > 0.5 ? 'text-orange-500' : ''}`}>{currentStats.windageBiasInches.toFixed(2)}"</span></div>
              <div className="flex justify-between"><span>MOA @ {distanceYards}yd</span><span className="font-mono font-bold">{inchesToMOA(currentStats.maxRadiusInches * 2, distanceYards).toFixed(1)} MOA</span></div>
              {currentStats.outliers.length > 0 && (
                <Badge variant="destructive">{currentStats.outliers.length} FLYERS DETECTED</Badge>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <TrendingUp className="text-primary" /> ML TREND & PREDICTION
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trend ? (
                <div className="space-y-3">
                  <div>Next session predicted group: <span className="font-mono text-2xl font-bold">{trend.predictedGroupSizeMOA.toFixed(1)} MOA</span></div>
                  <div>Trend slope: <span className="font-mono">{trend.trendSlope} MOA/session</span></div>
                  <div>Confidence: {(trend.confidence * 100).toFixed(0)}%</div>
                  <div className="pt-2 text-sm border-t italic">{trend.recommendation}</div>
                  <Badge>Powered by Linear Regression + your history</Badge>
                </div>
              ) : (
                <p className="text-muted-foreground">Log 3+ sessions with this analyzer for ML trend predictions and personalized coaching.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">ACTIONS</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={handleSave} disabled={!currentStats} size="lg" className="w-full gap-2">
                <Plus /> SAVE TO SESSION + UPDATE ML
              </Button>
              <Button onClick={removeLastImpact} variant="outline" className="w-full">Undo Last Arrow</Button>
              <Button onClick={() => setShowEllipse(!showEllipse)} variant="outline" className="w-full">
                Toggle Group Ellipse
              </Button>
              <div className="pt-4 text-xs text-muted-foreground">
                This group data feeds directly into WalkbackTuner for advanced tuning diagnosis.
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="text-xs text-muted-foreground max-w-prose">
        Pro tips: Bright even lighting, camera perpendicular. For full ML upgrade: replace heuristic with tfjs YOLO model. Pairs perfectly with WalkbackTuner for complete tuning workflow.
      </div>
    </div>
  );
};

export default AutoGroupMLAnalyzer;