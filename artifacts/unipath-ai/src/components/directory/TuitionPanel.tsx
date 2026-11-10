import { useState } from 'react';
import { Link } from 'wouter';
import type { University, UniversityTuition } from '@workspace/api-client-react';
import { AlertTriangle, ArrowRight, ExternalLink, Info } from 'lucide-react';
import { CURRENCIES } from '@/components/profile/PreferenceFields';
import { RateNote, fmtMoney, fmtUsd, useUsdRate } from '@/components/money/currency';

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'not recorded';
const thisYear = new Date().getFullYear();

export function tuitionStatusLabel(t?: UniversityTuition) {
  if (!t || t.status === 'missing') return 'Tuition not imported';
  if (t.status === 'outdated') return 'Outdated source figure';
  return 'Source-reported';
}

function Cell({ label, amount, year, hint, rate, currency }: { label: string; amount: number | null; year: number | null; hint: string; rate: number | null; currency: string }) {
  if (amount == null) return <div className="tu-cell tu-missing"><span>{label}</span><strong>Not reported</strong><small>{hint}</small></div>;
  return <div className="tu-cell"><span>{label}</span><strong>{fmtUsd(amount)}<small style={{display:'inline',marginLeft:4}}>/ year</small></strong>
    {currency !== 'USD' && rate && <span className="fx-converted">about {fmtMoney(amount * rate, currency)}</span>}
    <small>{year ? `Source reporting year ${year}` : 'Reporting year not provided'}{year && thisYear - year >= 2 ? ' · may be out of date' : ''}. {hint}</small></div>;
}

export function TuitionPanel({ school }: { school: University }) {
  const t = school.tuition;
  const [currency, setCurrency] = useState('USD');
  const { rate } = useUsdRate(currency);
  const [rateChoice, setRateChoice] = useState<'in' | 'out' | 'intl' | 'mine' | 'none'>('none');
  const [myTuition, setMyTuition] = useState('');
  const myNum = myTuition.trim() === '' ? null : Number(myTuition);
  const myValid = myNum != null && Number.isFinite(myNum) && myNum >= 0;
  const [costs, setCosts] = useState({ accommodation: '', food: '', transport: '', other: '' });
  const missing = !t || t.status === 'missing' || (t.inStateAmount == null && t.outOfStateAmount == null && t.internationalAmount == null);
  const tuitionPick = rateChoice === 'in' ? t?.inStateAmount : rateChoice === 'out' ? t?.outOfStateAmount : rateChoice === 'intl' ? t?.internationalAmount : rateChoice === 'mine' && myValid ? myNum : null;
  const parsed = Object.values(costs).map(v => v.trim() === '' ? null : Number(v));
  const invalid = parsed.some(n => n != null && (!Number.isFinite(n) || n < 0));
  const invalidTuition = rateChoice === 'mine' && myNum !== null && !myValid;
  const entered = parsed.filter((n): n is number => n != null && Number.isFinite(n) && n >= 0);
  const living = entered.reduce((a, b) => a + b, 0);
  const hasAny = entered.length > 0 || tuitionPick != null;
  const total = living + (tuitionPick ?? 0);

  return <section className="tu-panel" data-testid="panel-tuition">
    <span className="eyebrow">ANNUAL TUITION</span>
    <h2>What the source reports for tuition</h2>
    <p style={{fontSize:13,color:'#5d7081',margin:0}}>Figures are per academic year, in USD, as published by the source. They are not a quote, do not include fees the source omits, and may differ from what you are charged.</p>
    <div className="tu-filter-grid" style={{gridTemplateColumns:'minmax(0,220px)',marginTop:12}}>
      <label>SHOW ESTIMATE IN<select value={currency} onChange={e => setCurrency(e.target.value)} data-testid="select-tuition-currency">{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
    </div>
    <RateNote currency={currency}/>
    {missing ? <div className="tu-warn" data-testid="text-tuition-missing"><AlertTriangle size={15}/><span><strong>Tuition for this school is not available in UniPath yet.</strong> We tried to import official figures, but none are loaded, so we show nothing rather than guess. Unknown does not mean free or low cost. You can add your own estimate in the calculator below. {t?.note} Check the school’s official cost pages.</span></div> : <>
      <div className="tu-rows">
        <Cell label="In-state" amount={t!.inStateAmount} year={t!.inStateYear} hint="Applies to state residents only." rate={rate} currency={currency}/>
        <Cell label="Out-of-state" amount={t!.outOfStateAmount} year={t!.outOfStateYear} hint="Not verified international tuition." rate={rate} currency={currency}/>
        <Cell label="International" amount={t!.internationalAmount} year={null} hint="A verified international rate is rarely published by this source." rate={rate} currency={currency}/>
      </div>
      <div className="tu-info"><Info size={15}/><span>Out-of-state is a U.S. nonresident reporting category, <strong>not verified international tuition</strong>. Confirm your own fee category, residency eligibility, and current costs with the university.</span></div>
      {t!.status === 'outdated' && <div className="tu-warn"><AlertTriangle size={15}/><span>These are historical source figures and may be out of date. They are not current tuition quotes.</span></div>}
      {t!.note && <p style={{fontSize:12,color:'#5d7081',marginTop:10}}>{t!.note}</p>}
    </>}
    <div className="tu-meta" data-testid="text-tuition-meta">
      <span>Status: <b>{tuitionStatusLabel(t)}</b></span>
      <span>Period: <b>per year</b></span>
      <span>Directory record updated: <b>{fmtDate(t?.recordUpdatedAt ?? school.lastUpdatedAt)}</b></span>
      {t?.sourceUrl && <a className="text-link" href={t.sourceUrl} target="_blank" rel="noreferrer">Tuition source <ExternalLink size={11}/></a>}
    </div>
    <p style={{fontSize:11,color:'#687b8c',marginTop:6}}>The source reporting year is the period the figure covers, not its publication date. The directory record update date is not a tuition verification date.</p>

    <h3>Optional: estimate a yearly total</h3>
    <p style={{fontSize:12,color:'#5d7081',margin:'0 0 10px'}}>Enter your own USD estimates. Nothing here is saved or sent anywhere. Leave a field blank to leave it out.</p>
    <div className="tu-calc">
      <label>Tuition to include<select value={rateChoice} onChange={e => setRateChoice(e.target.value as typeof rateChoice)} data-testid="select-calc-tuition">
        <option value="none">Leave tuition out</option>
        <option value="mine">My own tuition estimate</option>
        <option value="in" disabled={t?.inStateAmount == null}>In-state{t?.inStateAmount == null ? ' (not reported)' : ''}</option>
        <option value="out" disabled={t?.outOfStateAmount == null}>Out-of-state{t?.outOfStateAmount == null ? ' (not reported)' : ''}</option>
        <option value="intl" disabled={t?.internationalAmount == null}>International{t?.internationalAmount == null ? ' (not reported)' : ''}</option>
      </select></label>
      {(['accommodation', 'food', 'transport', 'other'] as const).map(k => <label key={k}>{k === 'transport' ? 'Transportation' : k[0].toUpperCase() + k.slice(1)} (USD)<input inputMode="decimal" value={costs[k]} onChange={e => setCosts(c => ({ ...c, [k]: e.target.value }))} placeholder="Your estimate" data-testid={`input-cost-${k}`}/></label>)}
    </div>
    {rateChoice === 'mine' && <div className="tu-calc" style={{marginTop:10}}><label>Your tuition estimate (USD per year)<input inputMode="decimal" value={myTuition} onChange={e => setMyTuition(e.target.value)} placeholder="From the school's cost page" data-testid="input-my-tuition"/><small style={{fontWeight:400,color:'#687b8c'}}>Your estimate, not a source figure.</small></label></div>}
    {rateChoice === 'mine' && myNum != null && !myValid && <p className="tu-error" role="alert">Your tuition estimate must be 0 or more.</p>}
    {invalid && <p className="tu-error" role="alert">Use finite numbers of 0 or more. Correct invalid entries to see a total.</p>}
    {invalid || invalidTuition ? <p className="tu-error" role="status">Total unavailable until the invalid estimate is corrected.</p> : hasAny ? <div className="tu-total" data-testid="text-cost-total"><div><small>YOUR ESTIMATED YEAR</small><strong>{fmtUsd(total)}</strong>{currency !== 'USD' && rate && <small>about {fmtMoney(total * rate, currency)}</small>}</div><small>{tuitionPick == null ? 'Living costs only: tuition is unknown and not included' : rateChoice === 'mine' ? 'Includes your own tuition estimate (not a school figure)' : 'Includes a source tuition figure'} · {entered.length} of 4 living costs entered</small></div>
      : <p style={{fontSize:12,color:'#687b8c',marginTop:10}}>Add an amount to see a total. Blank fields are not counted as zero cost.</p>}

    <div className="tu-links">
      {school.financialAidWebsite && <a className="text-link" href={school.financialAidWebsite.startsWith('http') ? school.financialAidWebsite : `https://${school.financialAidWebsite}`} target="_blank" rel="noreferrer" data-testid="link-financial-aid">Official financial aid page <ExternalLink size={12}/></a>}
      {school.website && <a className="text-link" href={school.website.startsWith('http') ? school.website : `https://${school.website}`} target="_blank" rel="noreferrer" data-testid="link-official-site">Official school website <ExternalLink size={12}/></a>}
      <a className="text-link" href={school.sourceUrl} target="_blank" rel="noreferrer" data-testid="link-record-source">Directory record source <ExternalLink size={12}/></a>
      <Link href="/funding" className="text-link" data-testid="link-funding-finder">Look for scholarships <ArrowRight size={13}/></Link>
    </div>
    <p style={{fontSize:11,color:'#687b8c',marginTop:8}}>Scholarships and aid are never guaranteed and are not subtracted from these totals.</p>
  </section>;
}
