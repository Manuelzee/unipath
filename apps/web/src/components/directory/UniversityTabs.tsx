import { useRef, type KeyboardEvent } from 'react';
import { cn } from './format';

export type TabId = 'overview' | 'fields' | 'admissions' | 'funding' | 'links';
export const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' }, { id: 'fields', label: 'Fields of Study' }, { id: 'admissions', label: 'Admissions' },
  { id: 'funding', label: 'Scholarships & Funding' }, { id: 'links', label: 'Official Links' },
];

export function UniversityTabs({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length; else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = TABS.length - 1;
    if (n < 0) return; e.preventDefault(); onChange(TABS[n].id); refs.current[n]?.focus();
  };
  return <div className="detail-tabs" role="tablist" aria-label="Institution details">
    {TABS.map((t, i) => <button key={t.id} ref={el => { refs.current[i] = el; }} role="tab" id={`tab-${t.id}`} aria-selected={active === t.id} aria-controls={`panel-${t.id}`} tabIndex={active === t.id ? 0 : -1} className={cn('detail-tab', active === t.id && 'detail-tab-active')} onClick={() => onChange(t.id)} onKeyDown={e => onKey(e, i)} data-testid={`tab-${t.id}`}>{t.label}</button>)}
  </div>;
}
