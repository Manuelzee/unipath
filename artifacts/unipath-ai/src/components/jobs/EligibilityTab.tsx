import { useState } from 'react';
import { AlertTriangle, ExternalLink, Info, MessageCircleQuestion, Search } from 'lucide-react';
import {
  getGetStudentProfileQueryKey, getGetWorkGuidanceQueryKey, getListSavedUniversitiesQueryKey,
  useGetStudentProfile, useGetWorkGuidance, useListSavedUniversities,
} from '@workspace/api-client-react';
import { fmtDate } from './shared';

const STUDY = { full_time: 'Enrolled full-time', part_time: 'Enrolled part-time', break: 'On a break between terms', finished: 'Finished my studies', unsure: 'Not sure' } as const;
type Study = keyof typeof STUDY | '';

function questions(country: string, visa: string, study: Study, uni: string) {
  const at = uni.trim() ? ` at ${uni.trim()}` : '';
  const v = visa && visa !== 'Other / not sure' ? `my ${visa}` : 'my visa or permit';
  const q = [
    `Based on ${v}, what kinds of work am I allowed to do in ${country}, and what do I need before I start?`,
    `Is on-campus work${at} treated differently from off-campus work for someone in my situation?`,
    'Do any limits on hours apply to me during term time and during breaks, and where are they written?',
    'Do I need any written authorization, endorsement, or permit before accepting a specific job?',
    'Does internship or placement work connected to my program need separate approval?',
    'What documents should I keep, and who should I tell if my job or study status changes?',
  ];
  if (study === 'part_time') q.push('Does studying part-time change what work I can do?');
  if (study === 'break') q.push('Does being on a break between terms change what work I can do, and when does that period start and end?');
  if (study === 'finished') q.push('Now that I have finished my studies, what options exist for working, and what are the deadlines to apply?');
  if (study === 'unsure') q.push('How is my current enrollment status recorded, and how does it affect work?');
  if (!visa || visa === 'Other / not sure') q.push('Can you confirm exactly which visa or permit category I hold?');
  return q;
}

export function EligibilityTab({ goSearch }: { goSearch: () => void }) {
  const g = useGetWorkGuidance({ query: { queryKey: getGetWorkGuidanceQueryKey() } });
  const prof = useGetStudentProfile({ query: { queryKey: getGetStudentProfileQueryKey(), retry: false } });
  const saved = useListSavedUniversities({ query: { queryKey: getListSavedUniversitiesQueryKey(), retry: false } });
  const [code, setCode] = useState('');
  const [visa, setVisa] = useState('');
  const [study, setStudy] = useState<Study>('');
  const [uni, setUni] = useState<string | null>(null);
  const countries = g.data?.countries ?? [];
  const sc = prof.data?.profile?.studyCountry?.trim().toLowerCase();
  const defCode = countries.find(c => c.code.toLowerCase() === sc || c.name.toLowerCase() === sc)?.code ?? '';
  const cur = countries.find(c => c.code === (code || defCode));
  const uniVal = uni ?? saved.data?.[0]?.university.name ?? '';
  const visas = cur?.code === 'US' ? ['F-1', 'J-1', 'Other / not sure'] : ['Student visa or study permit', 'Other / not sure'];
  const ready = !!cur && !!visa && !!study;
  return <div className="sj-stack">
    <div className="sj-warn" role="note" data-testid="status-eligibility-disclaimer"><AlertTriangle size={18} />
      <p><strong>This assistant does not decide your eligibility or approve any job.</strong> It gathers official sources and questions to bring to your school's international office. Nothing you enter here is stored.</p></div>
    {g.isLoading ? <div className="loading-stack"><div className="skeleton skeleton-card" /></div>
      : g.isError ? <div className="state-card"><h3>We couldn't load official sources</h3><p>Please try again.</p><button className="button button-primary button-small" onClick={() => void g.refetch()} data-testid="button-retry-eligibility">Try again</button></div>
      : <>
        <div className="sj-card sj-form" data-testid="form-eligibility">
          <h2 className="sj-h2">Your situation</h2>
          <div className="sj-grid">
            <label className="field"><span>1. Destination country</span><select value={cur?.code ?? ''} onChange={e => { setCode(e.target.value); setVisa(''); }} data-testid="select-elig-country"><option value="">Choose a country</option>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
            <label className="field"><span>2. Visa or permit type</span><select value={visa} onChange={e => setVisa(e.target.value)} disabled={!cur} data-testid="select-elig-visa"><option value="">Choose one</option>{visas.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
            <label className="field"><span>3. Study status</span><select value={study} onChange={e => setStudy(e.target.value as Study)} data-testid="select-elig-study"><option value="">Choose one</option>{Object.entries(STUDY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field"><span>4. University (optional)</span><input value={uniVal} onChange={e => setUni(e.target.value)} maxLength={160} data-testid="input-elig-university" /></label>
          </div>
        </div>
        {!ready ? <div className="state-card" data-testid="status-eligibility-incomplete"><div className="state-icon"><MessageCircleQuestion size={22} /></div><h3>Answer the first three steps</h3><p>Your sources and questions appear here once you pick a country, visa type, and study status.</p></div>
          : <div className="sj-stack" data-testid="section-eligibility-result">
            <div className="sj-card">
              <h2 className="sj-h2">Official sources for {cur.name}</h2>
              {cur.coverage === 'entry_points' ? <p className="sj-muted" data-testid="status-elig-coverage">We only found the agency's home or study page. UniPath has not confirmed it states student work rules.</p> : <p className="sj-muted" data-testid="status-elig-coverage">These links point to official pages about student work.</p>}
              <ul className="sj-sources">{cur.sources.map((s, i) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" data-testid={`link-elig-source-${i}`}>{s.title} <ExternalLink size={13} /></a><span>{s.agency}</span><small>Link last checked {fmtDate(s.checkedAt)}</small></li>)}</ul>
            </div>
            {cur.topics.length > 0 && <div className="sj-card"><h2 className="sj-h2">Topics to ask about</h2>
              <div className="sj-chips">{cur.topics.map(t => <span key={t} className="sj-chip">{t}</span>)}</div>
              <p className="sj-muted">{cur.code === 'US' ? 'Ask your DSO whether CPT, OPT, or STEM OPT apply to you. UniPath does not say whether they do.' : 'Read these on the official pages above; UniPath does not summarize them.'}</p></div>}
            {cur.contact && <div className="sj-card"><h2 className="sj-h2">Who to ask</h2><p className="sj-body" data-testid="text-elig-contact">{cur.contact}</p></div>}
            <div className="sj-card" data-testid="card-elig-questions"><h2 className="sj-h2"><MessageCircleQuestion size={16} /> Questions to bring to your school's international office</h2>
              <ol className="sj-list">{questions(cur.name, visa, study, uniVal).map((t, i) => <li key={i} data-testid={`text-elig-question-${i}`}>{t}</li>)}</ol>
              <p className="sj-muted">General questions based on your answers. They are not rules and not legal or immigration advice.</p></div>
          </div>}
      </>}
    <div className="sj-honest"><Info size={18} /><p>When you know what you are allowed to do, search listings and save the ones worth applying to.</p></div>
    <div className="sj-actions"><button className="button button-primary button-small" onClick={goSearch} data-testid="button-elig-search-jobs"><Search size={14} /> Search jobs</button></div>
  </div>;
}
