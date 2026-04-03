import { Target } from 'lucide-react';

interface HeaderProps {
  actions?: React.ReactNode;
}

export function Header({ actions }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-background shadow-sm">
      <div className="flex items-center justify-between h-full px-4">
        <div className="flex items-center gap-2">
          <Target className="w-6 h-6 text-primary" />
          <h1 className="text-lg font-semibold text-primary">Arrow Tracker</h1>
        </div>
        <div className="flex items-center gap-2">
          {actions}
        </div>
      </div>
    </header>
  );
}
