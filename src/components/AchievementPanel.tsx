import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Target, Crosshair, Flame, Trophy, Crown, Star, Zap, Calendar, CalendarCheck, Award, Timer, Repeat, Medal, Lock } from 'lucide-react';
import type { Achievement } from '@/types';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Target, Crosshair, Flame, Trophy, Crown, Star, Zap, Calendar, CalendarCheck, Award, Timer, Repeat, Medal,
};

interface AchievementPanelProps {
  achievements: Achievement[];
  totalArrows: number;
  todayArrows: number;
  streak: number;
  sessions: number;
}

export function AchievementPanel({ achievements, totalArrows, todayArrows, streak, sessions }: AchievementPanelProps) {
  const unlocked = achievements.filter(a => a.unlockedAt);
  const locked = achievements.filter(a => !a.unlockedAt);

  const getProgress = (a: Achievement) => {
    switch (a.condition) {
      case 'arrows_total': return Math.min(100, Math.round((totalArrows / a.threshold) * 100));
      case 'arrows_day': return Math.min(100, Math.round((todayArrows / a.threshold) * 100));
      case 'streak_days': return Math.min(100, Math.round((streak / a.threshold) * 100));
      case 'sessions_total': return Math.min(100, Math.round((sessions / a.threshold) * 100));
      default: return 0;
    }
  };

  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-amber-500" /> Achievements
        </h3>
        <Badge variant="secondary" className="text-xs">{unlocked.length}/{achievements.length}</Badge>
      </div>

      {unlocked.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {unlocked.map(a => {
            const Icon = ICON_MAP[a.icon] || Star;
            return (
              <div key={a.id} className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                <Icon className="w-4 h-4 text-amber-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{a.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{a.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        {locked.slice(0, 5).map(a => {
          const progress = getProgress(a);
          return (
            <div key={a.id} className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Lock className="w-3 h-3 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium truncate">{a.title}</p>
                  <span className="text-[10px] text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="h-1 mt-0.5" />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function StreakBadge({ streak, longest }: { streak: number; longest: number }) {
  if (streak === 0) return null;
  const isLongest = streak >= longest;
  return (
    <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${isLongest ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' : 'bg-primary/10 text-primary'}`}>
      <Flame className="w-3.5 h-3.5" />
      {streak}-day streak{isLongest && '!'}
    </div>
  );
}
