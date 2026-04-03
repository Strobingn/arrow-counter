import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ArrowSession } from '@/types';

interface HistoryItem {
  date: string;
  sessions: ArrowSession[];
  totalArrows: number;
  sessionCount: number;
}

interface HistoryProps {
  history: HistoryItem[];
  formatNumber: (num: number) => string;
}

export function History({ history, formatNumber }: HistoryProps) {
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const toggleDate = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (dateStr === today) {
      return 'Today';
    } else if (dateStr === yesterdayStr) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  if (history.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary mb-4">History</h2>
        <p className="text-sm text-muted-foreground text-center py-4">
          No history yet. Start shooting!
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-primary mb-4">History</h2>
      
      <div className="space-y-2">
        {history.map((item) => {
          const isExpanded = expandedDates.has(item.date);
          
          return (
            <div
              key={item.date}
              className="border border-border rounded-xl overflow-hidden"
            >
              <button
                onClick={() => toggleDate(item.date)}
                className={cn(
                  'w-full flex items-center justify-between p-3 transition-colors duration-200',
                  'hover:bg-secondary/50 active:bg-secondary'
                )}
              >
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium text-primary">
                    {formatDate(item.date)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.sessionCount} session{item.sessionCount !== 1 ? 's' : ''}
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-primary">
                    {formatNumber(item.totalArrows)} arrows
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </button>
              
              {isExpanded && (
                <div className="border-t border-border bg-secondary/30">
                  {item.sessions.map((session, idx) => (
                    <div
                      key={session.id}
                      className={cn(
                        'flex items-center justify-between px-4 py-2',
                        idx !== item.sessions.length - 1 && 'border-b border-border/50'
                      )}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">
                          {formatTime(session.timestamp)}
                        </span>
                        {session.note && (
                          <span className="text-xs text-muted-foreground">
                            {session.note}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-medium text-primary">
                        {formatNumber(session.arrowCount)} arrows
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
