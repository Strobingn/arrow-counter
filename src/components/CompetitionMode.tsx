import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Trophy, Play, Square, Target, X, Trash2, TrendingUp, Crosshair } from 'lucide-react';
import { useCompetition, ROUND_FORMATS, type CompetitionFormat, type CompetitionRound } from '@/hooks/useCompetition';
import type { BowProfile } from '@/types';

interface CompetitionModeProps {
  bowProfiles: BowProfile[];
}

export function CompetitionMode({ bowProfiles }: CompetitionModeProps) {
  const { rounds, activeRound, roundStats, startRound, scoreArrow, finishRound, abandonRound, deleteRound } = useCompetition();
  const [selectedFormat, setSelectedFormat] = useState<CompetitionFormat>('nfaa_300');
  const [selectedBow, setSelectedBow] = useState<string>('');

  if (activeRound) {
    const format = ROUND_FORMATS[activeRound.formatId];
    return <ActiveScorecard round={activeRound} stats={roundStats!} format={format} onScore={scoreArrow} onFinish={finishRound} onAbandon={abandonRound} bowProfiles={bowProfiles} />;
  }

  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-amber-500" /> Competition Mode
        </h3>
      </div>

      {/* Format selector */}
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Round Format</label>
          <Select value={selectedFormat} onValueChange={(v) => setSelectedFormat(v as CompetitionFormat)}>
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(ROUND_FORMATS).map(f => (
                <SelectItem key={f.id} value={f.id}>
                  <div className="flex flex-col">
                    <span className="font-medium">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{f.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Bow</label>
          <Select value={selectedBow} onValueChange={setSelectedBow}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Select bow (optional)" />
            </SelectTrigger>
            <SelectContent>
              {bowProfiles.map(b => <SelectItem key={b.id} value={b.id}><Crosshair className="w-3 h-3 mr-1 inline" />{b.name}</SelectItem>)}
              {bowProfiles.length === 0 && <SelectItem value="none" disabled>No bows added</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={() => startRound(selectedFormat, selectedBow || undefined)} className="w-full rounded-full">
          <Play className="w-4 h-4 mr-1" /> Start Round
        </Button>
      </div>

      {/* Past rounds */}
      {rounds.length > 0 && (
        <>
          <Separator className="my-3" />
          <h4 className="text-xs font-medium mb-2">Past Rounds ({rounds.length})</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {rounds.map(r => {
              const format = ROUND_FORMATS[r.formatId];
              let total = 0, xCount = 0, arrows = 0;
              for (const e of r.ends) for (const a of e.arrows) if (a !== null) { arrows++; if (a === 'X') { total += format.maxScorePerArrow; xCount++; } else total += Number(a) || 0; }
              return (
                <div key={r.id} className="border rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{format.name}</span>
                      <Badge variant="outline" className="text-[10px]">{r.date}</Badge>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>Score: <strong className="text-foreground">{total}</strong></span>
                      {format.xRing && <span>X's: <strong className="text-red-500">{xCount}</strong></span>}
                      <span>{arrows}/{r.ends.length * format.arrowsPerEnd} arrows</span>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteRound(r.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

function ActiveScorecard({ round, stats, format, onScore, onFinish, onAbandon, bowProfiles }: {
  round: CompetitionRound;
  stats: { total: number; xCount: number; arrowsShot: number; totalArrows: number; maxPossible: number; percentComplete: number };
  format: { maxScorePerArrow: number; scoringRings: string[]; xRing: boolean; name: string };
  onScore: (endIndex: number, arrowIndex: number, score: string | null) => void;
  onFinish: () => void;
  onAbandon: () => void;
  bowProfiles: BowProfile[];
}) {
  const [activeEnd, setActiveEnd] = useState(0);
  const bow = bowProfiles.find(b => b.id === round.bowId);

  const end = round.ends[activeEnd];
  if (!end) return null;

  return (
    <Card className="p-4 rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <Target className="w-4 h-4 text-primary" /> {format.name}
          </h3>
          {bow && <p className="text-xs text-muted-foreground">{bow.name}</p>}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{stats.total}<span className="text-sm text-muted-foreground font-normal">/{stats.maxPossible}</span></p>
          <div className="flex gap-2 text-xs">
            {format.xRing && <span className="text-red-500 font-semibold">{stats.xCount} X's</span>}
            <span className="text-muted-foreground">{stats.percentComplete}%</span>
          </div>
        </div>
      </div>

      <Progress value={stats.percentComplete} className="h-2 mb-4" />

      {/* End navigator */}
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {round.ends.map((e, i) => {
          const complete = e.arrows.every(a => a !== null);
          return (
            <button
              key={i}
              onClick={() => setActiveEnd(i)}
              className={`min-w-[36px] h-8 rounded-lg text-xs font-medium transition-all ${
                i === activeEnd ? 'bg-primary text-white' :
                complete ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'
              }`}
            >
              {e.targetNumber}
            </button>
          );
        })}
      </div>

      {/* Distance / target info */}
      <div className="flex items-center justify-between mb-2">
        <Badge variant="secondary" className="text-xs">
          Target {end.targetNumber} {end.distance > 0 && `| ${end.distance}yd`}
        </Badge>
        <span className="text-xs text-muted-foreground">
          End {activeEnd + 1} of {round.ends.length}
        </span>
      </div>

      {/* Arrow score buttons */}
      <div className="space-y-2 mb-4">
        {end.arrows.map((score, ai) => (
          <div key={ai} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-14">Arrow {ai + 1}</span>
            <div className="flex gap-1 flex-1 flex-wrap">
              {format.scoringRings.map(ring => (
                <button
                  key={ring}
                  onClick={() => onScore(activeEnd, ai, ring)}
                  className={`min-w-[36px] h-9 rounded-lg text-sm font-bold transition-all ${
                    score === ring
                      ? ring === 'X' ? 'bg-red-500 text-white scale-110' :
                        ring === '10' || ring === '14' ? 'bg-amber-500 text-white' :
                        ring === '12' ? 'bg-orange-500 text-white' :
                        'bg-primary text-white'
                      : 'bg-secondary hover:bg-primary/20'
                  }`}
                >
                  {ring}
                </button>
              ))}
              <button
                onClick={() => onScore(activeEnd, ai, null)}
                className={`min-w-[36px] h-9 rounded-lg text-sm transition-all ${score === null ? 'bg-muted text-muted-foreground' : 'bg-secondary hover:bg-muted'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {score !== null && (
              <span className={`text-sm font-bold w-6 text-center ${score === 'X' ? 'text-red-500' : ''}`}>{score}</span>
            )}
          </div>
        ))}

        {/* End total */}
        <div className="flex justify-end text-sm">
          <span className="text-muted-foreground">End total: </span>
          <span className="font-bold ml-1">
            {end.arrows.reduce((s, a) => s + (a === 'X' ? format.maxScorePerArrow : Number(a) || 0), 0)}
          </span>
        </div>
      </div>

      <Separator className="my-3" />

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onAbandon} className="flex-1 rounded-full">Abandon</Button>
        <Button size="sm" onClick={onFinish} className="flex-1 rounded-full" variant={stats.percentComplete === 100 ? "default" : "outline"}>
          <Square className="w-4 h-4 mr-1" /> Finish Round
        </Button>
      </div>
    </Card>
  );
}
