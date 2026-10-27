import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getGetStudentProfileQueryKey, getGetStudentRecommendationsQueryKey,
  useGetStudentProfile, useGetStudentRecommendations, useSaveStudentProfile,
} from '@workspace/api-client-react';
import type { RecommendationAssessment, SchoolRecommendation, StudentProfile, StudentProfileInput } from '@workspace/api-client-react';
import { AlertCircle, ArrowRight, Check, CheckCircle2, ChevronDown, LoaderCircle, ExternalLink, Globe2, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
import { InstitutionLogo } from '@/components/directory/InstitutionLogo';
import { schoolLocation } from '@/components/directory/format';
import { PreferenceFields, budgetLabel, formatBudgetAmount, priorityLabel, thisYear } from '@/components/profile/PreferenceFields';
import '@/components/profile/preferences.css';

const STATUS: Record<string, [string, string]> = {
  may_fit: ['st-good', 'May fit budget'], available: ['st-good', 'Available'], listed: ['st-good', 'Listed'],
  needs_verification: ['st-unknown', 'Needs verification'], above_budget: ['st-bad', 'Above budget'], deadline_passed: ['st-bad', 'Deadline passed'],
};
function statusClass(status: string) { return STATUS[status]?.[0] ?? 'st-unknown'; }
function safeUrl(raw: string): string | null {
  try { const url = new URL(raw.trim()); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function firstSafe(list: string[] | undefined) { for (const x of list ?? []) { const v = safeUrl(x); if (v) return v; } return null; }
const human = (s: string) => s.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase());

function Status({ label, a, id }: { label: string; a: RecommendationAssessment; id: string }) {
  return <div className="rec-status" data-testid={`status-${id}`}><span>{label}</span><strong className={statusClass(a.status)}>{STATUS[a.status]?.[1] ?? human(a.status)}</strong>
    <p>{a.message}</p>{(a.deadline || a.reportingYear) && <p>{a.deadline ? `Deadline: ${a.deadline}` : ''}{a.deadline && a.reportingYear ? ' · ' : ''}{a.reportingYear ? `Reporting year ${a.reportingYear}` : ''}</p>}</div>;
}

function RecCard({ r }: { r: SchoolRecommendation }) {
  const u = r.university;
  const admUrl = firstSafe(r.startTerm.sources); const aidUrl = firstSafe(r.funding.sources); const budgetUrl = firstSafe(r.affordability.sources); const home = u.website ? safeUrl(u.website) : null;
  const score = Math.round(r.score); const cov = Math.round(r.evidenceCoverage <= 1 ? r.evidenceCoverage * 100 : r.evidenceCoverage);
  return <article className="rec-card page-enter" data-testid={`card-recommendation-${u.id}`}>
    <div>
      <div className="rec-top"><InstitutionLogo school={u}/><div><h3>{u.name}</h3><p>{schoolLocation(u)}</p></div></div>
      {u.majors.length > 0 ? <div className="rec-programs">{u.majors.slice(0, 6).map(m => <span key={m}>{m}</span>)}{u.majors.length > 6 && <span>+{u.majors.length - 6} more</span>}</div>
        : <div className="rec-missing"><span><AlertCircle size={11}/> Program list not reported</span></div>}
      {r.reasons.length > 0 && <ul className="rec-reasons">{r.reasons.map(x => <li key={x}><CheckCircle2 size={14}/>{x}</li>)}</ul>}
      <div className="rec-status-grid">
        <Status label="AFFORDABILITY (VERIFIED ONLY)" a={r.affordability} id={`afford-${u.id}`}/>
        <Status label="SCHOLARSHIPS" a={r.funding} id={`funding-${u.id}`}/>
        <Status label="START TERM" a={r.startTerm} id={`term-${u.id}`}/>
      </div>
      {r.missingInformation.length > 0 && <div className="rec-missing">{r.missingInformation.map(m => <span key={m}><AlertCircle size={11}/> Missing: {m}</span>)}</div>}
      <div className="rec-links">
        {budgetUrl && <a href={budgetUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-budget-evidence-${u.id}`}>Official budget evidence <ExternalLink size={12}/></a>}
        {admUrl ? <a href={admUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-admissions-${u.id}`}>Official admissions <ExternalLink size={12}/></a>
          : u.admissionsWebsite && safeUrl(u.admissionsWebsite) ? <a href={safeUrl(u.admissionsWebsite)!} target="_blank" rel="noopener noreferrer" data-testid={`link-admissions-${u.id}`}>Admissions page (directory listing) <ExternalLink size={12}/></a> : null}
        {aidUrl ? <a href={aidUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-aid-${u.id}`}>Official scholarships <ExternalLink size={12}/></a>
          : u.financialAidWebsite && safeUrl(u.financialAidWebsite) ? <a href={safeUrl(u.financialAidWebsite)!} target="_blank" rel="noopener noreferrer" data-testid={`link-aid-${u.id}`}>Financial aid page (directory listing) <ExternalLink size={12}/></a> : null}
        {(!admUrl || !aidUrl) && home && <a href={home} target="_blank" rel="noopener noreferrer" className="rec-fallback" data-testid={`link-homepage-${u.id}`}>School homepage (not source-verified for this match) <ExternalLink size={12}/></a>}
        <Link href={`/university/${u.id}`} data-testid={`link-detail-${u.id}`}>View details <ArrowRight size={12}/></Link>
      </div>
    </div>
    <div className="rec-score" data-testid={`score-${u.id}`}><span>PREFERENCE SCORE</span><strong>{score}</strong>
      <div className="rec-bar"><i style={{ transform: `scaleX(${Math.min(1, Math.max(0, score / 100))})` }}/></div>
      <small>How well listed data fits your stated preferences. Not an admission probability.</small>
      <small>Evidence coverage: {cov}%</small></div>
  </article>;
}

export function RecommendationsView() {
  const profileQ = useGetStudentProfile({ query: { queryKey: getGetStudentProfileQueryKey() } });
  const p = profileQ.data?.profile;
  const recQ = useGetStudentRecommendations({ query: { queryKey: getGetStudentRecommendationsQueryKey(), enabled: !!p } });
  const budget = p?.budgetChoice === 'custom' ? (p.customBudget ? formatBudgetAmount(p.customBudget, p.budgetCurrency || 'USD') : 'Custom, not set')
    : p?.budgetChoice ? budgetLabel(p.budgetChoice, p.budgetCurrency || 'USD') : undefined;

  return <div className="page page-enter">
    <div className="page-heading"><div><div className="eyebrow">MATCHED TO WHAT YOU SHARED</div><h1>Schools worth a look.</h1><p>Ranked by your saved preferences. A starting point, never a promise.</p></div>
      <Link href="/profile" className="button button-outline button-small" data-testid="link-edit-preferences"><SlidersHorizontal size={15}/> Edit questionnaire</Link></div>
    <div className="data-notice rec-disclaimer"><ShieldCheck size={16}/><span><strong>No school tuition figures are shown.</strong> Scores reflect fit with your preferences using verified records only. They do not estimate admission chances. Confirm everything on official university pages.</span></div>

    {profileQ.isLoading ? <Skeleton/> : profileQ.isError ? <ErrorCard retry={() => void profileQ.refetch()}/> : <>
      <Questionnaire profile={p ?? null}/>
      {!p ? <Empty title="Start with the questionnaire" body="Fill in the questionnaire above and save. Recommendations appear once your preferences are saved."/> : <>
      <div className="rec-profile-strip" data-testid="rec-profile-summary">
        <Item label="LOCATION" v={p.preferredLocation || p.studyCountry}/><Item label="MAJOR" v={p.major}/><Item label="DEGREE" v={p.degreeLevel}/>
        <Item label="APPLICANT" v={p.applicantStatus ? human(p.applicantStatus) : ''}/><Item label="TRACK" v={({ first_year: 'First-year', transfer: 'Transfer', graduate: 'Graduate', unsure: 'Not sure' } as Record<string, string>)[p.admissionTrack ?? 'unsure']}/><Item label="START" v={p.startTerm ? `${human(p.startTerm)} ${p.startYear ?? ''}` : ''}/>
        <Item label="BUDGET (PRIVATE)" v={budget ? `${budget}${p.budgetScope ? ` · ${p.budgetScope === 'total' ? 'total cost' : 'tuition only'}` : ''}` : ''}/>
        <Item label="TOP PRIORITIES" v={(p.topPriorities ?? []).map(priorityLabel).join(', ')}/>
      </div>
      {recQ.isLoading ? <Skeleton/> : recQ.isError ? <ErrorCard retry={() => void recQ.refetch()}/> : !recQ.data?.items.length ?
        <Empty title="No verified matches yet" body="Try widening your location, degree level, or major in the questionnaire above. We only show schools with enough verified evidence."/> : <>
        <div className="results-header"><div><h2>{recQ.data.items.length} recommendations</h2><p>From {recQ.data.totalCandidates} candidates · generated {new Date(recQ.data.generatedAt).toLocaleString()}</p></div></div>
        <div className="rec-list">{recQ.data.items.map(r => <RecCard key={r.university.id} r={r}/>)}</div>
        <div className="rec-method" data-testid="text-methodology"><strong>How this works.</strong> {recQ.data.methodology}<br/><br/><strong>Please note.</strong> {recQ.data.disclaimer}</div>
      </>}
    </>}</>}
  </div>;
}
function Item({ label, v }: { label: string; v?: string | null }) {
  return <div><span>{label}</span><strong>{v && v.trim() ? v : 'Not set'}</strong></div>;
}
function Skeleton() { return <div className="loading-stack" aria-label="Loading"><div className="skeleton skeleton-line"/><div className="skeleton skeleton-card"/><div className="skeleton skeleton-card"/></div>; }
function ErrorCard({ retry }: { retry: () => void }) {
  return <div className="state-card"><div className="state-icon warning"><Globe2 size={21}/></div><h3>We couldn’t load recommendations</h3><p>Give it another try. Your saved profile is safe.</p><button className="button button-primary button-small" onClick={retry} data-testid="button-retry-recs">Try again</button></div>;
}
function Empty({ title, body }: { title: string; body: string }) {
  return <div className="state-card"><div className="state-icon"><UserRound size={22}/></div><h3>{title}</h3><p>{body}</p><Link href="/profile" className="button button-primary button-small">Open my profile <ArrowRight size={15}/></Link></div>;
}

const DEFAULTS: StudentProfileInput = {
  residenceCountry: '', citizenship: '', studyCountry: '', degreeLevel: '', major: '', grades: '', annualBudgetUsd: 0,
  preferredLanguage: '', englishTest: '', englishScore: '', budgetCurrency: 'USD', budgetScope: 'tuition',
  priorities: [], topPriorities: [], preferredLocation: '', residenceRegion: '', admissionTrack: 'unsure',
};
function toInput(p: StudentProfile | null): StudentProfileInput {
  if (!p) return { ...DEFAULTS };
  const { updatedAt: _u, ...rest } = p; void _u;
  return { ...DEFAULTS, ...rest };
}

function Questionnaire({ profile }: { profile: StudentProfile | null }) {
  const qc = useQueryClient(); const save = useSaveStudentProfile();
  const [open, setOpen] = useState(!profile);
  const [form, setForm] = useState<StudentProfileInput>(() => toInput(profile));
  const [dirty, setDirty] = useState(false);
  const syncedAt = useRef(profile?.updatedAt ?? null);
  // Re-sync from server only when the saved record changes and the student has no unsaved edits.
  useEffect(() => {
    const at = profile?.updatedAt ?? null;
    if (at !== syncedAt.current && !dirty) { syncedAt.current = at; setForm(toInput(profile)); }
  }, [profile, dirty]);
  const edit = (fn: (f: StudentProfileInput) => StudentProfileInput) => { setDirty(true); save.reset(); setForm(fn); };
  const set = <K extends keyof StudentProfileInput>(k: K, v: StudentProfileInput[K]) => edit(f => ({ ...f, [k]: v }));
  const customInvalid = form.budgetChoice === 'custom' && !(Number(form.customBudget) > 0);
  const pastYear = form.startYear != null && form.startYear < thisYear;
  const submit = (e: FormEvent) => {
    e.preventDefault(); if (customInvalid || pastYear) return;
    const data: StudentProfileInput = { ...form, annualBudgetUsd: Number(form.annualBudgetUsd) || 0,
      customBudget: form.budgetChoice === 'custom' ? Math.floor(Number(form.customBudget)) : null,
      topPriorities: (form.topPriorities ?? []).slice(0, 3) };
    if (!data.applicantStatus) delete data.applicantStatus;
    save.mutate({ data }, { onSuccess: async () => {
      setDirty(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetStudentProfileQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetStudentRecommendationsQueryKey() }),
      ]);
    } });
  };
  return <section className="content-panel rec-quiz" data-testid="panel-questionnaire">
    <button type="button" className="rec-quiz-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)} data-testid="button-toggle-questionnaire">
      <div><span className="eyebrow">MATCHING QUESTIONNAIRE</span><h2>Adjust what you’re looking for</h2><p>Changes save to your profile and refresh your matches.</p></div>
      <ChevronDown size={18} className={open ? 'rec-chev open' : 'rec-chev'}/>
    </button>
    {open && <form onSubmit={submit} className="rec-quiz-body page-enter">
      <div className="form-grid">
        <label className="field"><span>Where might you study?</span><input value={form.studyCountry} onChange={e => set('studyCountry', e.target.value)} placeholder="Country, or still exploring" data-testid="quiz-study-country"/></label>
        <label className="field"><span>Preferred location</span><input value={form.preferredLocation ?? ''} maxLength={150} onChange={e => set('preferredLocation', e.target.value)} placeholder="City, region, or anywhere" data-testid="quiz-preferred-location"/></label>
        <label className="field"><span>Desired major</span><input value={form.major} onChange={e => set('major', e.target.value)} placeholder="A subject or field" data-testid="quiz-major"/></label>
        <label className="field"><span>Degree level</span><select value={form.degreeLevel} onChange={e => set('degreeLevel', e.target.value)} data-testid="quiz-degree"><option value="">Choose a level</option>{(['Bachelor', 'Master', 'Doctorate', 'Undergraduate', 'Graduate'].includes(form.degreeLevel) || !form.degreeLevel ? [] : [form.degreeLevel]).concat(['Bachelor', 'Master', 'Doctorate', 'Undergraduate', 'Graduate']).map(v => <option key={v}>{v}</option>)}</select></label>
        <label className="field"><span>Applicant status</span><select value={form.applicantStatus ?? ''} onChange={e => set('applicantStatus', (e.target.value || undefined) as StudentProfileInput['applicantStatus'])} data-testid="quiz-applicant-status"><option value="">Choose one</option><option value="domestic">Domestic</option><option value="international">International</option><option value="unsure">Not sure</option></select></label>
        <label className="field"><span>Application track</span><select value={form.admissionTrack ?? 'unsure'} onChange={e => set('admissionTrack', e.target.value as NonNullable<StudentProfileInput['admissionTrack']>)} data-testid="quiz-admission-track"><option value="first_year">First-year</option><option value="transfer">Transfer</option><option value="graduate">Graduate</option><option value="unsure">Not sure</option></select></label>
      </div>
      <PreferenceFields form={form} setForm={edit}/>
      <div className="form-footer">
        <span>{dirty ? 'You have unsaved changes.' : 'Academic details, grades, and test scores stay as saved on My profile.'}</span>
        <button className="button button-primary" disabled={save.isPending || customInvalid || pastYear} data-testid="button-save-questionnaire">
          {save.isPending ? <><LoaderCircle size={16} className="spin"/> Updating matches…</> : save.isSuccess ? <><Check size={16}/> Matches updated</> : <>Save and update matches <ArrowRight size={16}/></>}
        </button>
      </div>
      {pastYear && <p className="form-error" role="alert">Your saved start year has passed. Choose a future year before saving.</p>}
      {customInvalid && <p className="form-error" role="alert">Enter a positive custom budget amount, or choose another option.</p>}
      {save.isError && <p className="form-error" role="alert" data-testid="text-questionnaire-error">We couldn’t save your answers, so your matches were not changed. Please check your connection and try again.</p>}
    </form>}
  </section>;
}
