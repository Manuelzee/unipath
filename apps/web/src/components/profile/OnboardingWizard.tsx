import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import {
  getGetBudgetSettingsQueryKey, getGetStudentDashboardQueryKey, getGetStudentProfileQueryKey, getGetStudentRecommendationsQueryKey,
  useGetStudentProfile, useSaveStudentProfile,
} from '@workspace/api-client-react';
import type { StudentProfile, StudentProfileInput } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Globe2, Languages, LoaderCircle, Pencil, ShieldCheck, Wallet } from 'lucide-react';
import { BudgetFields, budgetLabel, formatBudgetAmount, invalidLivingExpenses, thisYear } from './PreferenceFields';
import { ErrorBlock, LoadingBlock } from '@/components/directory/StateViews';
import { PageHeading, cn, errorMessage } from '@/components/workspace/shared';
import '@/components/money/money.css';
import './preferences.css';

const STEPS = [
  { title: 'Personal', sub: 'Where you are and want to go', icon: Globe2 },
  { title: 'Academic', sub: 'Your studies and timing', icon: BookOpen },
  { title: 'Budget', sub: 'A private planning range', icon: Wallet },
  { title: 'Language', sub: 'Instruction and tests', icon: Languages },
  { title: 'Review', sub: 'Check and save', icon: Check },
] as const;

const DEFAULTS: StudentProfileInput = {
  residenceCountry: '', citizenship: '', studyCountry: '', degreeLevel: '', major: '', grades: '', annualBudgetUsd: 0,
  preferredLanguage: '', englishTest: '', englishScore: '', budgetCurrency: 'USD', budgetScope: 'tuition',
  priorities: [], topPriorities: [], preferredLocation: '', residenceRegion: '', admissionTrack: 'unsure',
  currentQualification: '', gradingScale: '', graduationYear: null, englishTestDate: null, startTerm: 'flexible',
};
function toInput(p: StudentProfile | null | undefined): StudentProfileInput {
  if (!p) return { ...DEFAULTS };
  const { updatedAt: _u, ...rest } = p; void _u;
  return { ...DEFAULTS, ...rest };
}

const DEGREES = ['Bachelor', 'Master', 'Doctorate', 'Undergraduate', 'Graduate'];
const QUALIFICATIONS = ['High school diploma', 'A-Levels', 'WAEC / WASSCE', 'IB Diploma', 'Associate degree', 'Bachelor’s degree', 'Master’s degree', 'Other'];
const SCALES = ['4.0 GPA', 'Percentage (0–100)', 'A-Level grades', 'WAEC A1–F9', 'IB points (0–45)', 'UK degree classification', 'Other'];
const LANGUAGES = ['English', 'French', 'German', 'Spanish', 'Portuguese', 'Italian', 'Dutch', 'Chinese', 'Japanese', 'Korean', 'Arabic'];
const NO_SCORE = ['Not taken yet', 'Not required (native speaker or exempt)'];
const TESTS = ['IELTS Academic', 'TOEFL iBT', 'Duolingo English Test', 'PTE Academic', 'Cambridge English (C1/C2)', ...NO_SCORE, 'Other'];
const TERMS = ['fall', 'spring', 'summer', 'winter', 'flexible'] as const;
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;
const TRACKS: Array<[NonNullable<StudentProfileInput['admissionTrack']>, string]> = [['first_year', 'First-year'], ['transfer', 'Transfer'], ['graduate', 'Graduate'], ['unsure', 'Not sure']];

function Field({ label, why, children, wide }: { label: string; why: string; children: ReactNode; wide?: boolean }) {
  return <label className="field" style={wide ? { gridColumn: '1 / -1' } : undefined}><span>{label}</span>{children}<small className="why">Why we ask: {why}</small></label>;
}

export function OnboardingWizard() {
  const q = useGetStudentProfile({ query: { queryKey: getGetStudentProfileQueryKey() } });
  const save = useSaveStudentProfile(); const qc = useQueryClient(); const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<StudentProfileInput>(DEFAULTS);
  const loaded = useRef(false);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (loaded.current || !q.data) return;
    loaded.current = true;
    setForm(toInput(q.data.profile));
  }, [q.data]);
  useEffect(() => { top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [step]);

  const set = <K extends keyof StudentProfileInput>(k: K, v: StudentProfileInput[K]) => { save.reset(); setForm(f => ({ ...f, [k]: v })); };
  const customInvalid = form.budgetChoice === 'custom' && !(Number(form.customBudget) >= 1 && Number(form.customBudget) <= 1e9);
  const livingInvalid = invalidLivingExpenses(form.livingExpenses);
  const pastYear = form.startYear != null && form.startYear < thisYear;
  const stepInvalid = step === 1 ? pastYear : step === 2 ? customInvalid || livingInvalid : false;
  const blocked = customInvalid || livingInvalid || pastYear;

  const persist = (then: string) => {
    if (blocked) return;
    const data: StudentProfileInput = {
      ...form, annualBudgetUsd: Number(form.annualBudgetUsd) || 0,
      customBudget: form.budgetChoice === 'custom' ? Math.floor(Number(form.customBudget)) : null,
      topPriorities: (form.topPriorities ?? []).slice(0, 3),
      englishTestDate: form.englishTestDate || null, graduationYear: form.graduationYear ?? null,
    };
    if (!data.applicantStatus) delete data.applicantStatus;
    if (!data.budgetChoice) delete data.budgetChoice;
    save.mutate({ data }, { onSuccess: () => {
      for (const key of [getGetStudentProfileQueryKey(), getGetStudentRecommendationsQueryKey(), getGetBudgetSettingsQueryKey(), getGetStudentDashboardQueryKey()])
        void qc.invalidateQueries({ queryKey: key });
      setLocation(then);
    } });
  };

  const tests = form.englishTest && !TESTS.includes(form.englishTest) ? [form.englishTest, ...TESTS] : TESTS;
  const noScore = NO_SCORE.includes(form.englishTest);
  const years = Array.from({ length: 22 }, (_, i) => thisYear + 6 - i);
  const startYears = Array.from({ length: 8 }, (_, i) => thisYear + i);

  return <div className="page page-enter" ref={top}>
    <PageHeading kicker={`WELCOME · STEP ${step + 1} OF ${STEPS.length}`} title="Let’s set up your profile."
      body="Five short steps. Skip anything you’re unsure about and change it later. Each answer explains why we ask."/>
    {q.isLoading ? <LoadingBlock/> : q.isError ? <ErrorBlock retry={() => void q.refetch()}/> : <div className="wizard">
      <ol className="wizard-steps" aria-label="Onboarding steps">
        {STEPS.map((s, i) => <li key={s.title}><button type="button" className={cn('wizard-step', i < step && 'is-done')} aria-current={i === step ? 'step' : undefined}
          onClick={() => !stepInvalid && setStep(i)} data-testid={`wizard-step-${i + 1}`}>
          <b>{i < step ? <Check size={13}/> : i + 1}</b><span>{s.title}<small>{s.sub}</small></span></button></li>)}
      </ol>

      <form className="content-panel wizard-body" onSubmit={e => { e.preventDefault(); if (step < 4) { if (!stepInvalid) setStep(step + 1); } else persist('/dashboard'); }}>
        <div className="wizard-progress"><div className="meter meter-light"><i style={{ transform: `scaleX(${(step + 1) / STEPS.length})` }}/></div></div>
        <div className="wizard-title"><div className="profile-icon">{(() => { const Icon = STEPS[step].icon; return <Icon size={20}/>; })()}</div>
          <div><h2>{['Where are you, and where might you go?', 'Your studies so far', 'What could you spend each year?', 'Language of study', 'Review your answers'][step]}</h2>
            <p>{['Location details shape which requirements and fees apply to you.', 'Used to match programs and explain entry requirements.', 'Optional and private. Never shared with schools or sent to the AI assistant.', 'Used to check language requirements. It’s fine if you haven’t taken a test.', 'Check everything, then save. You can edit any answer later.'][step]}</p></div></div>

        {step === 0 && <div className="form-grid">
          <Field label="Country of residence" why="some requirements and fees depend on where you live."><input value={form.residenceCountry} maxLength={100} onChange={e => set('residenceCountry', e.target.value)} placeholder="e.g. Nigeria" data-testid="wizard-residence"/></Field>
          <Field label="Citizenship" why="it helps decide whether you apply as a domestic or international student. It is never sent to the AI assistant."><input value={form.citizenship} maxLength={100} onChange={e => set('citizenship', e.target.value)} placeholder="Country or countries" data-testid="wizard-citizenship"/></Field>
          <Field label="Intended study country" why="matches start with schools in this country. Type “Any” if you’re open."><input value={form.studyCountry} maxLength={100} onChange={e => set('studyCountry', e.target.value)} placeholder="e.g. Canada, or Any" data-testid="wizard-study-country"/></Field>
          <Field label="State, province or region (optional)" why="some tuition and scholarships are regional. Never sent to the AI assistant."><input value={form.residenceRegion ?? ''} maxLength={100} onChange={e => set('residenceRegion', e.target.value)} placeholder="e.g. Lagos" data-testid="wizard-region"/></Field>
          <div className="field" style={{ gridColumn: '1 / -1' }}><span>Will you apply as a domestic or international student?</span>
            <div className="seg">{([['domestic', 'Domestic'], ['international', 'International'], ['unsure', 'Not sure']] as const).map(([v, l]) =>
              <button type="button" key={v} className={(form.applicantStatus ?? 'unsure') === v ? 'is-on' : ''} aria-pressed={(form.applicantStatus ?? 'unsure') === v} onClick={() => set('applicantStatus', v)} data-testid={`wizard-applicant-${v}`}>{l}</button>)}</div>
            <small className="why">Why we ask: tuition, deadlines and requirements often differ for international applicants.</small></div>
        </div>}

        {step === 1 && <div className="form-grid">
          <Field label="Current or most recent qualification" why="it determines which entry requirements apply to you.">
            <input list="wizard-qualifications" value={form.currentQualification ?? ''} maxLength={120} onChange={e => set('currentQualification', e.target.value)} placeholder="e.g. WAEC / WASSCE" data-testid="wizard-qualification"/>
            <datalist id="wizard-qualifications">{QUALIFICATIONS.map(v => <option key={v} value={v}/>)}</datalist></Field>
          <Field label="Degree level you want" why="matches are limited to schools offering this level.">
            <select value={form.degreeLevel} onChange={e => set('degreeLevel', e.target.value)} data-testid="wizard-degree"><option value="">Choose a level</option>
              {(DEGREES.includes(form.degreeLevel) || !form.degreeLevel ? DEGREES : [form.degreeLevel, ...DEGREES]).map(v => <option key={v}>{v}</option>)}</select></Field>
          <Field label="Intended major or field" why="used to find schools that list related programs."><input value={form.major} maxLength={150} onChange={e => set('major', e.target.value)} placeholder="e.g. Computer Science" data-testid="wizard-major"/></Field>
          <div className="field"><span>Application track</span><div className="seg seg-wrap">{TRACKS.map(([v, l]) =>
            <button type="button" key={v} className={(form.admissionTrack ?? 'unsure') === v ? 'is-on' : ''} aria-pressed={(form.admissionTrack ?? 'unsure') === v} onClick={() => set('admissionTrack', v)}>{l}</button>)}</div>
            <small className="why">Why we ask: first-year, transfer and graduate applications have different deadlines.</small></div>
          <Field label="Grades or GPA" why="compared with published requirements only where a school reports them."><input value={form.grades} maxLength={120} onChange={e => set('grades', e.target.value)} placeholder="e.g. 3.6, 78%, AAB" data-testid="wizard-grades"/></Field>
          <Field label="Grading scale" why="grading systems differ by country; UniPath never converts them automatically.">
            <input list="wizard-scales" value={form.gradingScale ?? ''} maxLength={60} onChange={e => set('gradingScale', e.target.value)} placeholder="e.g. 4.0 GPA" data-testid="wizard-scale"/>
            <datalist id="wizard-scales">{SCALES.map(v => <option key={v} value={v}/>)}</datalist></Field>
          <Field label="Graduation year" why="some programs and scholarships depend on when you finish.">
            <select value={form.graduationYear ?? ''} onChange={e => set('graduationYear', e.target.value ? Number(e.target.value) : null)} data-testid="wizard-graduation"><option value="">Not sure</option>
              {form.graduationYear != null && !years.includes(form.graduationYear) && <option value={form.graduationYear}>{form.graduationYear}</option>}
              {years.map(y => <option key={y} value={y}>{y}</option>)}</select></Field>
          <div className="field"><span>Preferred start</span><div className="seg seg-wrap">{TERMS.map(t =>
            <button type="button" key={t} className={(form.startTerm ?? 'flexible') === t ? 'is-on' : ''} aria-pressed={(form.startTerm ?? 'flexible') === t} onClick={() => set('startTerm', t)}>{t === 'flexible' ? 'Flexible' : cap(t)}</button>)}</div>
            <select style={{ marginTop: 6 }} value={form.startYear ?? ''} onChange={e => set('startYear', e.target.value ? Number(e.target.value) : null)} aria-label="Start year" data-testid="wizard-start-year"><option value="">Year not sure</option>
              {pastYear && <option value={form.startYear!}>{form.startYear} (past year)</option>}{startYears.map(y => <option key={y} value={y}>{y}</option>)}</select>
            <small className="why">Why we ask: used to check intake and deadline records.</small>
            {pastYear && <small className="pref-hint" role="alert">Your saved start year has passed. Choose a future year or “Year not sure”.</small>}</div>
        </div>}

        {step === 2 && <>
          <BudgetFields form={form} setForm={fn => { save.reset(); setForm(fn); }} onSkip={() => { set('budgetChoice', 'none'); set('customBudget', null); setStep(3); }}/>
          {customInvalid && <p className="form-error" role="alert">Enter a custom amount from 1 to 1,000,000,000, or choose another option.</p>}
        </>}

        {step === 3 && <div className="form-grid">
          <Field label="Preferred language of instruction" why="checked against the languages listed in school records.">
            <input list="wizard-languages" value={form.preferredLanguage} maxLength={60} onChange={e => set('preferredLanguage', e.target.value)} placeholder="e.g. English" data-testid="wizard-language"/>
            <datalist id="wizard-languages">{LANGUAGES.map(v => <option key={v} value={v}/>)}</datalist></Field>
          <Field label="English test" why="lets the assistant explain gaps against published language requirements.">
            <select value={form.englishTest} onChange={e => { const v = e.target.value; set('englishTest', v); if (NO_SCORE.includes(v)) { set('englishScore', ''); set('englishTestDate', null); } }} data-testid="wizard-english-test">
              <option value="">Choose one</option>{tests.map(t => <option key={t}>{t}</option>)}</select></Field>
          {!noScore && form.englishTest && <>
            <Field label="Score (optional)" why="only your own record; never shared with schools."><input value={form.englishScore} maxLength={40} onChange={e => set('englishScore', e.target.value)} placeholder="e.g. 7.0 overall" data-testid="wizard-english-score"/></Field>
            <Field label="Test date (optional)" why="many schools only accept scores up to two years old."><input type="date" value={form.englishTestDate ?? ''} onChange={e => set('englishTestDate', e.target.value || null)} data-testid="wizard-english-date"/></Field>
          </>}
        </div>}

        {step === 4 && <div className="review-grid" data-testid="wizard-review">
          <Review title="Personal" onEdit={() => setStep(0)} rows={[['Residence', form.residenceCountry], ['Citizenship', form.citizenship], ['Study country', form.studyCountry], ['Region', form.residenceRegion], ['Applicant status', cap(form.applicantStatus ?? '')]]}/>
          <Review title="Academic" onEdit={() => setStep(1)} rows={[['Qualification', form.currentQualification], ['Degree level', form.degreeLevel], ['Major', form.major], ['Track', TRACKS.find(t => t[0] === form.admissionTrack)?.[1]], ['Grades', [form.grades, form.gradingScale].filter(Boolean).join(' · ')], ['Graduation year', form.graduationYear ? String(form.graduationYear) : ''], ['Start', form.startTerm && form.startTerm !== 'flexible' ? `${cap(form.startTerm)} ${form.startYear ?? ''}` : form.startYear ? `Flexible ${form.startYear}` : 'Flexible']]}/>
          <Review title="Budget (private)" onEdit={() => setStep(2)} rows={[['Annual budget', form.budgetChoice === 'custom' ? (form.customBudget ? formatBudgetAmount(form.customBudget, form.budgetCurrency || 'USD') : '') : form.budgetChoice ? budgetLabel(form.budgetChoice, form.budgetCurrency || 'USD') : ''], ['Covers', form.budgetChoice && form.budgetChoice !== 'none' ? (form.budgetScope === 'total' ? 'Total annual cost' : 'Tuition only') : '']]}/>
          <Review title="Language" onEdit={() => setStep(3)} rows={[['Instruction language', form.preferredLanguage], ['English test', form.englishTest], ['Score', form.englishScore], ['Test date', form.englishTestDate ?? '']]}/>
        </div>}

        <div className="wizard-nav">
          {step > 0 && <button type="button" className="button button-outline button-small" onClick={() => setStep(step - 1)}><ArrowLeft size={15}/> Back</button>}
          <span className="ws-spacer"/>
          {step < 4 && <button type="button" className="ws-link ws-link-muted" disabled={save.isPending || blocked} onClick={() => persist('/dashboard')} data-testid="button-wizard-save-later">Save &amp; finish later</button>}
          <button className="button button-primary" disabled={save.isPending || (step === 4 ? blocked : stepInvalid)} data-testid={step === 4 ? 'button-wizard-save' : 'button-wizard-next'}>
            {save.isPending ? <><LoaderCircle size={16} className="spin"/> Saving…</> : step === 4 ? <>Save my profile <Check size={16}/></> : <>Next <ArrowRight size={16}/></>}</button>
        </div>
        {save.isError && <p className="form-error" role="alert">{errorMessage(save.error, 'We couldn’t save your profile. Nothing was changed; please try again.')}</p>}
        {step === 4 && blocked && <p className="form-error" role="alert">Fix the highlighted answers before saving.</p>}
      </form>
    </div>}
    <div className="ws-notice"><ShieldCheck size={16}/><span>Your profile is private to your account. UniPath never shares it with schools, and you can download or delete it from <Link href="/settings" className="text-link" style={{ display: 'inline' }}>Settings</Link>.</span></div>
  </div>;
}

function Review({ title, rows, onEdit }: { title: string; rows: Array<[string, string | null | undefined]>; onEdit: () => void }) {
  return <section className="review-card"><header><h3>{title}</h3><button type="button" className="ws-link" onClick={onEdit}><Pencil size={12}/> Edit</button></header>
    <dl>{rows.map(([k, v]) => <div key={k}><dt>{k.toUpperCase()}</dt><dd>{v && v.trim() ? v : <span className="unknown-value">Not set</span>}</dd></div>)}</dl></section>;
}
