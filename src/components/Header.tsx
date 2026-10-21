import type { ReactNode } from 'react';
import { Target } from 'lucide-react';

export function Header({ actions }: { actions?: ReactNode }) {
  return <header className="app-header"><div className="header-inner">
    <div className="brand"><span className="brand-icon"><Target size={25} strokeWidth={1.5} /></span><div><span>ARROW<span className="brand-light">COUNTER</span></span><small>TRAIN. TRACK. PROGRESS.</small></div></div>
    <div className="header-actions">{actions}</div>
  </div></header>;
}
