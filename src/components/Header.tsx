import { Target, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-white shadow-sm">
      <div className="flex items-center justify-between h-full px-4">
        <div className="flex items-center gap-2">
          <Target className="w-6 h-6 text-primary" />
          <h1 className="text-lg font-semibold text-primary">Arrow Tracker</h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full w-10 h-10 transition-all duration-150 hover:scale-105 active:scale-95"
        >
          <Settings className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}
