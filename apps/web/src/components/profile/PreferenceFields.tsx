import { useState } from 'react';
import { Link } from 'wouter';
import type { StudentProfileInput } from '@workspace/api-client-react';
import { ArrowDown, ArrowUp, GripVertical, Lock, X } from 'lucide-react';
import '@/components/profile/preferences.css';

type BudgetValue = NonNullable<StudentProfileInput['budgetChoice']>;
const fmt = (n: number, cur: string) => cur === 'USD' ? `$${n.toLocaleString('en-US')}` : `${n.toLocaleString('en-US')} ${cur}`;
export function budgetLabel(value: BudgetValue, currency = 'USD'): string {
  const c = currency || 'USD';
  switch (value) {
    case 'under_5000': return `Under ${fmt(5000, c)}`;
    case '5000_10000': return `${fmt(5000, c)} – ${fmt(10000, c)}`;
    case '10000_20000': return `${fmt(10000, c)} – ${fmt(20000, c)}`;
    case '20000_35000': return `${fmt(20000, c)} – ${fmt(35000, c)}`;
    case '35000_50000': return `${fmt(35000, c)} – ${fmt(50000, c)}`;
    case '50000_plus': return `${fmt(50000, c)}+`;
    case 'aid_needed': return 'I need financial aid';
    case 'none': return 'No budget limit';
    case 'custom': return 'Custom amount';
  }
}
export const formatBudgetAmount = fmt;
export const BUDGET_CHOICES: BudgetValue[] = ['under_5000', '5000_10000', '10000_20000', '20000_35000', '35000_50000', '50000_plus', 'aid_needed', 'none', 'custom'];
const COMMON = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'INR', 'CNY', 'JPY', 'KRW', 'NGN', 'BRL', 'MXN', 'PKR', 'VND', 'PHP', 'SGD', 'AED', 'CHF'];
const intlList = (() => { try { const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf; return f ? f('currency') : []; } catch { return []; } })();
/** Supported ISO 4217 fiat currencies (excludes IMF/SUCRE units). USD first. */
export const CURRENCIES: string[] = ['USD', ...Array.from(new Set([...intlList, ...COMMON])).filter(c => c !== 'USD' && c !== 'XDR' && c !== 'XSU').sort()];
let names: Intl.DisplayNames | null = null; try { names = new Intl.DisplayNames(undefined, { type: 'currency' }); } catch { names = null; }
export const currencyName = (c: string) => { try { return names?.of(c) ?? c; } catch { return c; } };
export function CurrencySelect({ value, onChange, testId, id, extra }: { value: string; onChange: (v: string) => void; testId: string; id?: string; extra?: string[] }) {
  const list = extra?.length ? Array.from(new Set([value, ...extra])) : (CURRENCIES.includes(value) ? CURRENCIES : [value, ...CURRENCIES]);
  return <select id={id} value={value} onChange={e => onChange(e.target.value)} data-testid={testId}>{list.map(c => <option key={c} value={c}>{c} · {currencyName(c)}</option>)}</select>;
}
export type BudgetForm = Pick<StudentProfileInput, 'budgetChoice' | 'budgetCurrency' | 'budgetScope' | 'customBudget' | 'livingExpenses'>;
export const LIVING_KEYS = ['accommodation', 'food', 'transport', 'other'] as const;
export const livingLabel = (k: string) => k === 'transport' ? 'Transportation' : k[0].toUpperCase() + k.slice(1);
export const invalidLivingExpenses = (living: BudgetForm['livingExpenses']) =>
  Object.values(living ?? {}).some(n => n != null && (!Number.isFinite(n) || n < 0 || n > 1e9));

/** Shared budget section used by onboarding and profile. */
export function BudgetFields<T extends BudgetForm>({ form, setForm, onSkip }: { form: T; setForm: (fn: (f: T) => T) => void; onSkip?: () => void }) {
  const set = <K extends keyof BudgetForm>(k: K, v: BudgetForm[K]) => setForm(f => ({ ...f, [k]: v }));
  const cur = form.budgetCurrency ?? 'USD';
  const living = form.livingExpenses ?? {};
  const setLiving = (k: typeof LIVING_KEYS[number], raw: string) => {
    if (raw === '') { setForm(f => ({ ...f, livingExpenses: { ...(f.livingExpenses ?? {}), [k]: null } })); return; }
    const n = Number(raw);
    setForm(f => ({ ...f, livingExpenses: { ...(f.livingExpenses ?? {}), [k]: n } }));
  };
  return <>
    <section className="pref-section">
      <div className="pref-head"><h3>Annual Tuition Budget</h3><span className="pref-private"><Lock size={12}/> Private to you</span></div>
      <p className="pref-sub">Optional. Choose your own yearly planning maximum. It is not a school tuition quote and is never shared with schools.</p>
      <button type="button" className="pref-skip" onClick={onSkip ?? (() => setForm(f => ({ ...f, budgetChoice: 'none', customBudget: null })))} data-testid="button-skip-budget">{onSkip ? 'Skip for now' : 'Clear budget limit · save profile to keep this choice'}</button>
      <div className="budget-grid" role="radiogroup" aria-label="Annual tuition budget">
        {BUDGET_CHOICES.map(c => <button type="button" role="radio" aria-checked={form.budgetChoice === c} className={'budget-chip' + (form.budgetChoice === c ? ' is-on' : '')} key={c} onClick={() => set('budgetChoice', c)} data-testid={`budget-${c}`}>{budgetLabel(c, cur)}</button>)}
      </div>
      <div className="form-grid pref-grid">
        <label className="field"><span>Preferred currency</span><CurrencySelect value={cur} onChange={c => setForm(f => ({ ...f, budgetCurrency: c, customBudget: null, livingExpenses: {} }))} testId="select-budget-currency"/><small className="pref-hint">Changing currency clears custom and living-cost amounts; values are not automatically converted.</small></label>
        {form.budgetChoice === 'custom' && <label className="field"><span>Custom annual maximum ({cur})</span><input type="number" min={1} max={1e9} step={1} inputMode="numeric" value={form.customBudget ?? ''} onChange={e => set('customBudget', e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 18500" data-testid="input-custom-budget"/></label>}
        <div className="field"><span>Budget covers</span><div className="seg">{(['tuition', 'total'] as const).map(s => <button type="button" key={s} className={(form.budgetScope ?? 'tuition') === s ? 'is-on' : ''} onClick={() => set('budgetScope', s)} data-testid={`budget-scope-${s}`}>{s === 'tuition' ? 'Tuition only' : 'Total annual cost'}</button>)}</div></div>
      </div>
      <h4 style={{marginTop:18}}>Optional annual living-expense estimates</h4>
      <p className="pref-sub">Your estimates in {cur}, saved with your account. Blank means unknown, not zero. These are separate from reported school costs.</p>
      <div className="form-grid pref-grid">{LIVING_KEYS.map(k => <label className="field" key={k}><span>{livingLabel(k)} ({cur} / year)</span><input type="number" min={0} max={1e9} step="0.01" inputMode="decimal" value={living[k] ?? ''} onChange={e => setLiving(k, e.target.value)} placeholder="Optional" data-testid={`input-living-${k}`}/></label>)}</div>
      {invalidLivingExpenses(living) && <p className="form-error" role="alert">Living-expense estimates must be between 0 and 1,000,000,000.</p>}
      <p className="pref-sub">Scholarships and financial aid are not guaranteed and are not automatically deducted from your budget. <Link href="/funding" className="text-link">Explore source-backed funding information</Link></p>
    </section>
  </>;
}
export const PRIORITIES: Array<{ key: string; label: string }> = [
  { key: 'scholarships', label: 'Scholarships and financial aid' }, { key: 'affordability', label: 'Affordable education' },
  { key: 'acceptance', label: 'Acceptance chances' }, { key: 'major', label: 'My preferred major or field of study' },
  { key: 'reputation', label: 'Strong academic reputation' }, { key: 'internships', label: 'Internship and job opportunities' },
  { key: 'career_outcomes', label: 'Career outcomes' }, { key: 'location_climate', label: 'Location and climate' },
  { key: 'close_to_home', label: 'Close to home' }, { key: 'campus_life', label: 'Campus life and student activities' },
  { key: 'sports', label: 'Sports and school spirit' }, { key: 'online', label: 'Online or hybrid programs' },
  { key: 'flexible_admissions', label: 'Flexible admission requirements' }, { key: 'international_support', label: 'Support for international students' },
  { key: 'diversity', label: 'Diversity and inclusion' }, { key: 'small_classes', label: 'Small class sizes' },
  { key: 'research', label: 'Research opportunities' }, { key: 'graduate_opportunities', label: 'Graduate school opportunities' },
  { key: 'housing', label: 'On-campus housing' }, { key: 'accessibility', label: 'Accessibility and student support services' },
];
export const priorityLabel = (key: string) => PRIORITIES.find(p => p.key === key)?.label ?? key;
const TERMS: Array<NonNullable<StudentProfileInput['startTerm']>> = ['spring', 'summer', 'fall', 'winter', 'flexible'];
export const thisYear = Math.max(new Date().getFullYear(), 2026);
const YEARS = Array.from({ length: 6 }, (_, i) => thisYear + i);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Props = { form: StudentProfileInput; setForm: (fn: (f: StudentProfileInput) => StudentProfileInput) => void };

export function PreferenceFields({ form, setForm }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const set = <K extends keyof StudentProfileInput>(k: K, v: StudentProfileInput[K]) => setForm(f => ({ ...f, [k]: v }));
  const priorities = form.priorities ?? [];
  const top = form.topPriorities ?? [];

  const togglePriority = (key: string) => setForm(f => {
    const cur = f.priorities ?? [];
    if (cur.includes(key)) return { ...f, priorities: cur.filter(k => k !== key), topPriorities: (f.topPriorities ?? []).filter(k => k !== key) };
    return { ...f, priorities: [...cur, key] };
  });
  const toggleTop = (key: string) => setForm(f => {
    const t = f.topPriorities ?? [];
    if (t.includes(key)) return { ...f, topPriorities: t.filter(k => k !== key) };
    if (t.length >= 3) return f;
    const p = f.priorities ?? [];
    return { ...f, priorities: p.includes(key) ? p : [...p, key], topPriorities: [...t, key] };
  });
  const move = (from: number, to: number) => setForm(f => {
    const t = [...(f.topPriorities ?? [])];
    if (to < 0 || to >= t.length) return f;
    const [item] = t.splice(from, 1); t.splice(to, 0, item);
    return { ...f, topPriorities: t };
  });

  return <>
    <BudgetFields form={form} setForm={setForm}/>

    <div className="pref-section">
      <div className="pref-head"><h3>When do you want to start school?</h3></div>
      <div className="form-grid pref-grid">
        <div className="field"><span>Start term</span><div className="seg seg-wrap">
          {TERMS.map(t => <button type="button" key={t} className={form.startTerm === t ? 'is-on' : ''} onClick={() => set('startTerm', t)} data-testid={`term-${t}`}>{t === 'flexible' ? 'Flexible / Any term' : cap(t)}</button>)}
        </div></div>
        <label className="field"><span>Start year</span><select value={form.startYear ?? ''} onChange={e => set('startYear', e.target.value ? Number(e.target.value) : null)} data-testid="select-start-year"><option value="">Not sure yet</option>{form.startYear != null && form.startYear < thisYear && <option value={form.startYear}>{form.startYear} (past year)</option>}{YEARS.map(y => <option key={y} value={y}>{y}</option>)}{form.startYear != null && form.startYear > YEARS[YEARS.length - 1] && <option value={form.startYear}>{form.startYear}</option>}</select>
          {form.startYear != null && form.startYear < thisYear && <small className="pref-hint" role="alert" data-testid="text-past-year">Your saved year {form.startYear} has passed. Please choose a future year or "Not sure yet".</small>}</label>
      </div>
    </div>

    <div className="pref-section">
      <div className="pref-head"><h3>What matters most to you?</h3><span className="pref-count">{priorities.length} selected · top {top.length}/3</span></div>
      <p className="pref-sub">Pick anything that matters. Then star up to three and drag to rank them.</p>
      <div className="prio-grid">
        {PRIORITIES.map(p => { const on = priorities.includes(p.key); const rank = top.indexOf(p.key);
          return <div key={p.key} className={'prio-chip' + (on ? ' is-on' : '')}>
            <button type="button" className="prio-main" aria-pressed={on} onClick={() => togglePriority(p.key)} data-testid={`priority-${p.key}`}>{p.label}</button>
            <button type="button" className={'prio-star' + (rank >= 0 ? ' is-top' : '')} disabled={rank < 0 && top.length >= 3} onClick={() => toggleTop(p.key)} aria-label={rank >= 0 ? `Remove ${p.label} from top three` : `Add ${p.label} to top three`} data-testid={`top-${p.key}`}>{rank >= 0 ? rank + 1 : '+'}</button>
          </div>; })}
      </div>
      <ol className="top-list" aria-label="Top three priorities">
        {[0, 1, 2].map(i => { const key = top[i];
          return key ? <li key={key} draggable className={'top-item' + (dragIndex === i ? ' dragging' : '')}
            onDragStart={() => setDragIndex(i)} onDragEnd={() => setDragIndex(null)} onDragOver={e => e.preventDefault()}
            onDrop={() => { if (dragIndex !== null) move(dragIndex, i); setDragIndex(null); }} data-testid={`top-rank-${i + 1}`}>
            <GripVertical size={15} className="grip"/><b>{i + 1}</b><span>{priorityLabel(key)}</span>
            <button type="button" className="icon-button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up"><ArrowUp size={14}/></button>
            <button type="button" className="icon-button" onClick={() => move(i, i + 1)} disabled={i === top.length - 1} aria-label="Move down"><ArrowDown size={14}/></button>
            <button type="button" className="icon-button" onClick={() => toggleTop(key)} aria-label="Remove from top three"><X size={14}/></button>
          </li> : <li key={`empty-${i}`} className="top-item top-empty"><b>{i + 1}</b><span>Open slot</span></li>; })}
      </ol>
    </div>
  </>;
}
