import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import type { University, UniversityTuition } from '@workspace/api-client-react';
import { AlertTriangle, ArrowRight, ExternalLink, Info } from 'lucide-react';
import { CurrencySelect, LIVING_KEYS, livingLabel } from '@/components/profile/PreferenceFields';
import { RateNote, fmtMoney, usePreferredCurrency, useUsdRate } from '@/components/money/currency';
import { QuoteAmount, QuoteSource, TUITION_LABELS, TuitionSourceRates, useTuitionFactor } from './TuitionQuote';

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'not recorded';
const url = (u: string) => u.startsWith('http') ? u : `https://${u}`;
type LivingKey = typeof LIVING_KEYS[number];
const EMPTY: Record<LivingKey, string> = { accommodation: '', food: '', transport: '', other: '' };

export function tuitionStatusLabel(t?: UniversityTuition) {
  if (!t || t.status === 'missing') return 'Tuition not available';
  if (t.status === 'outdated') return 'Outdated source figure';
  return 'Source-reported';
}

export function TuitionPanel({ school }: { school: University }) {
  const t = school.tuition;
  const quotes = t?.quotes ?? [];
  const [currency, setCurrency, saved] = usePreferredCurrency();
  const { rate } = useUsdRate(currency);
  const usdRate = currency === 'USD' ? 1 : rate;
  const [choice, setChoice] = useState('none');
  const selectedQuote = quotes.find(q => q.category === choice);
  const sourceFactor = useTuitionFactor(selectedQuote?.currency ?? 'USD', currency, usdRate);
  const [myTuition, setMyTuition] = useState('');
  const [costs, setCosts] = useState<Record<LivingKey, string>>(EMPTY);
  const [cleared, setCleared] = useState(false);
  const previousCurrency = useRef(currency);
  useEffect(() => {
    if (previousCurrency.current === currency) return;
    previousCurrency.current = currency;
    // This also covers the saved preference arriving after the initial render.
    // Never reinterpret already-entered amounts as a different currency.
    setCosts(EMPTY); setMyTuition(''); setChoice('none'); setCleared(true);
  }, [currency]);
  const missing = !quotes.length;

  const changeCurrency = (c: string) => {
    if (c === currency) return;
    const had = Object.values(costs).some(v => v.trim() !== '') || myTuition.trim() !== '';
    setCurrency(c); setCosts(EMPTY); setMyTuition(''); if (choice !== 'none') setChoice('none'); setCleared(had);
  };
  const useSaved = () => {
    const le = saved?.livingExpenses ?? {};
    setCosts({ accommodation: le.accommodation?.toString() ?? '', food: le.food?.toString() ?? '', transport: le.transport?.toString() ?? '', other: le.other?.toString() ?? '' });
    setCleared(false);
  };
  const savedHas = !!saved && LIVING_KEYS.some(k => saved.livingExpenses?.[k] != null);
  const savedMatches = savedHas && saved!.budgetCurrency === currency;

  const parse = (v: string) => v.trim() === '' ? null : Number(v);
  const parsed = LIVING_KEYS.map(k => parse(costs[k]));
  const invalid = parsed.some(n => n != null && (!Number.isFinite(n) || n < 0 || n > 1e9));
  const entered = parsed.filter((n): n is number => n != null && Number.isFinite(n) && n >= 0 && n <= 1e9);
  const living = entered.reduce((a, b) => a + b, 0);
  const myNum = parse(myTuition); const myValid = myNum != null && Number.isFinite(myNum) && myNum >= 0 && myNum <= 1e9;
  const invalidTuition = choice === 'mine' && myNum != null && !myValid;
  const tuitionPick = choice === 'mine' ? (myValid ? myNum : null) : selectedQuote && sourceFactor !== null ? selectedQuote.amount * sourceFactor : null;
  const hasAny = entered.length > 0 || tuitionPick != null;
  const total = living + (tuitionPick ?? 0);

  return <section className="tu-panel" data-testid="panel-tuition">
    <span className="eyebrow">ANNUAL TUITION</span>
    <h2>What the source reports for tuition</h2>
    <p style={{fontSize:13,color:'#5d7081',margin:0}}>Annual source figures in their original currency, not personalized quotes. U.S. tuition-only and B.C. arts-program figures have different scopes. Read each scope and academic year before comparing.</p>
    <div className="tu-filter-grid" style={{gridTemplateColumns:'minmax(0,320px)',marginTop:12}}>
      <label>SHOW AND CALCULATE IN<CurrencySelect value={currency} onChange={changeCurrency} testId="select-tuition-currency"/></label>
    </div>
    <RateNote currency={currency}/>
    <TuitionSourceRates quotes={quotes} currency={currency}/>
    {missing ? <div className="tu-warn" data-testid="text-tuition-missing"><AlertTriangle size={15}/><span><strong>Tuition for this school is not available in UniPath yet.</strong> We have no verified source figure for this record. Unknown does not mean free or low cost. Check the school’s official cost pages below, and add your own estimate in the calculator if you like.</span></div> : <>
      <div className={`tu-rows${school.countryCode !== 'US' ? ' tu-rows-two' : ''}`}>
        {(school.countryCode === 'US' ? ['in_state', 'out_of_state', 'international'] as const : ['domestic', 'international'] as const).map(category => {
          const quote = quotes.find(q => q.category === category);
          return <div key={category} className="tu-cell"><span>{TUITION_LABELS[category]}</span>
            <QuoteAmount quote={quote} rate={rate} currency={currency}/>
            {quote && <QuoteSource quote={quote}/>}
          </div>;
        })}
      </div>
      <div className="tu-info"><Info size={15}/><span>Out-of-state tuition is what a U.S. student from another state pays. It is <strong>not</strong> verified international tuition.</span></div>
      {t!.status === 'outdated' && <div className="tu-warn"><AlertTriangle size={15}/><span>These are historical source figures and are likely out of date.</span></div>}
      {t!.note && <p style={{fontSize:12,color:'#5d7081',marginTop:10}}>{t!.note}</p>}
    </>}
    <div className="tu-meta" data-testid="text-tuition-meta">
      <span>Status: <b>{tuitionStatusLabel(t)}</b></span>
      <span>Period: <b>per year</b></span>
      <span>Directory record updated: <b>{fmtDate(t?.recordUpdatedAt ?? school.lastUpdatedAt)}</b></span>
      {t?.sourceUrl && <a className="text-link" href={t.sourceUrl} target="_blank" rel="noreferrer">Tuition source <ExternalLink size={11}/></a>}
    </div>
    <p style={{fontSize:11,color:'#687b8c',marginTop:6}}>The academic year is the period the amount covers, not its publication or import date. A directory update does not verify current tuition.</p>

    <h3>Optional: estimate your year in {currency}</h3>
    <p style={{fontSize:12,color:'#5d7081',margin:'0 0 10px'}}>All amounts below are in {currency}. Changing the currency clears them so currencies are never mixed. Nothing here is saved.</p>
    {savedHas && <div style={{marginBottom:10}}><button type="button" className="pref-skip" disabled={!savedMatches} onClick={useSaved} data-testid="button-use-saved-living">Use my saved living costs</button>
      {!savedMatches && <small style={{display:'block',fontSize:11,color:'#687b8c',marginTop:4}}>Your saved estimates are in {saved!.budgetCurrency}. Switch to {saved!.budgetCurrency} to use them; we do not convert them.</small>}</div>}
    {cleared && <p className="fx-note" role="status">Amounts were cleared because the currency changed.</p>}
    <div className="tu-calc">
      <label>Tuition to include<select value={choice} onChange={e => setChoice(e.target.value as typeof choice)} data-testid="select-calc-tuition">
        <option value="none">Leave tuition out</option>
        <option value="mine">My own tuition estimate</option>
        {quotes.map(q => <option key={q.category} value={q.category}>Source {TUITION_LABELS[q.category]} ({q.currency}, {q.academicYear})</option>)}
      </select></label>
      {LIVING_KEYS.map(k => <label key={k}>{livingLabel(k)} ({currency})<input inputMode="decimal" value={costs[k]} onChange={e => { setCosts(c => ({ ...c, [k]: e.target.value })); setCleared(false); }} placeholder="Your estimate" data-testid={`input-cost-${k}`}/></label>)}
    </div>
    {selectedQuote && sourceFactor === null && <p className="tu-error" role="alert">The source tuition cannot be converted to {currency}; it is not included in the subtotal.</p>}
    {choice === 'mine' && <div className="tu-calc" style={{marginTop:10}}><label>Your tuition estimate ({currency} / year)<input inputMode="decimal" value={myTuition} onChange={e => setMyTuition(e.target.value)} placeholder="From the school's cost page" data-testid="input-my-tuition"/><small style={{fontWeight:400,color:'#687b8c'}}>Your estimate, not a school or source figure.</small></label></div>}
    {choice === 'mine' && myNum != null && !myValid && <p className="tu-error" role="alert">Your tuition estimate must be between 0 and 1,000,000,000.</p>}
    {invalid && <p className="tu-error" role="alert">Use numbers from 0 to 1,000,000,000. Fix invalid entries before a total can be shown.</p>}
    {invalid || invalidTuition ? <p className="tu-error" role="status" data-testid="text-cost-unavailable">Total unavailable. Correct the invalid amounts first.</p>
      : hasAny ? <div className="tu-total" data-testid="text-cost-total"><div><small>{tuitionPick == null ? 'LIVING-COST SUBTOTAL' : 'YOUR ESTIMATED YEAR'}</small><strong>{fmtMoney(total, currency)}</strong></div><small>{tuitionPick == null ? selectedQuote ? 'Source tuition could not be converted and is not included' : 'Tuition is not included' : choice === 'mine' ? 'Includes your own tuition estimate (not a school figure)' : 'Includes the selected source tuition figure'} · {entered.length} of 4 living costs entered</small></div>
      : <p style={{fontSize:12,color:'#687b8c',marginTop:10}}>Add an amount to see a total. Blank fields are not counted as zero.</p>}

    <div className="tu-links">
      {school.financialAidWebsite && <a className="text-link" href={url(school.financialAidWebsite)} target="_blank" rel="noreferrer" data-testid="link-financial-aid">Official financial aid page <ExternalLink size={12}/></a>}
      {school.website && <a className="text-link" href={url(school.website)} target="_blank" rel="noreferrer" data-testid="link-official-site">Official school website <ExternalLink size={12}/></a>}
      <a className="text-link" href={school.sourceUrl} target="_blank" rel="noreferrer" data-testid="link-record-source">Directory record source <ExternalLink size={12}/></a>
      <Link href="/funding" className="text-link" data-testid="link-funding-finder">Look for scholarships <ArrowRight size={13}/></Link>
    </div>
    <p style={{fontSize:11,color:'#687b8c',marginTop:8}}>Scholarships and aid are never guaranteed and are not subtracted from these totals.</p>
  </section>;
}
