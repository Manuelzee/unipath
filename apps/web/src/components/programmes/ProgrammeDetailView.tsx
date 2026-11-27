import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import {
  getGetProgrammeQueryKey, getGetProgrammeReadinessQueryKey, getListApplicationsQueryKey, useCreateApplication,
  useGetProgramme, useGetProgrammeReadiness, type Programme,
} from '@workspace/api-client-react';
import {
  ArrowLeft, ArrowRight, BadgeCheck, Check, CircleDashed, ClipboardList, ExternalLink, FileText, GraduationCap, LoaderCircle, RotateCw,
} from 'lucide-react';
import { useUser } from '@/lib/auth';
import { usePageMeta } from '@/lib/pageMeta';
import { useUsdRate, fmtUsd } from '@/components/money/currency';
import { errorMessage } from '@/components/workspace/shared';
import { ProgrammeCard, VerificationBadge } from './ProgrammeCard';
import { DOCUMENT_KIND_LABEL, LEVEL_LABEL, STUDY_MODE_LABEL, dateText, deadlineText, durationText, money, tuitionText } from './format';
import './programmes.css';

function UsdHint({ amount, currency }: { amount: number; currency: string }) {
  const { rate } = useUsdRate(currency);
  if (currency === 'USD' || !rate) return null;
  return <small className="prg-usd">about {fmtUsd(amount / rate)} at today's reference rate</small>;
}

export function ProgrammeDetailView({ id }: { id: number }) {
  const q = useGetProgramme(id, { query: { queryKey: getGetProgrammeQueryKey(id), enabled: Number.isInteger(id) && id > 0 } });
  const p = q.data?.programme;
  usePageMeta(p ? `${p.name} at ${p.institution.name}` : null,
    p ? `${p.name} at ${p.institution.name}, ${p.institution.country}: tuition, deadline, entry requirements and required documents.` : undefined);
  if (q.isLoading) return <div className="page"><div className="loading-stack"><div className="skeleton skeleton-line"/><div className="skeleton skeleton-card"/></div></div>;
  if (q.isError || !q.data || !p) {
    const missing = (q.error as { status?: number } | null)?.status === 404 || !Number.isInteger(id);
    return <div className="page"><div className="state-card" role="alert"><div className="state-icon warning">{missing ? <GraduationCap size={21}/> : <RotateCw size={21}/>}</div>
      <h3>{missing ? 'This programme is not listed' : 'This programme did not load'}</h3><p>{missing ? 'It may have been removed or is not published yet.' : 'This is a loading problem. Please try again.'}</p>
      {missing ? <Link href="/programmes" className="button button-primary button-small">Browse programmes</Link> : <button className="button button-primary button-small" onClick={() => void q.refetch()}>Try again</button>}</div></div>;
  }
  const deadline = deadlineText(p);
  const tuition = tuitionText(p);
  return <div className="page page-enter prg-detail" data-testid="page-programme">
    <Link href="/programmes" className="back-link"><ArrowLeft size={16}/> Programmes</Link>
    <header className="prg-head">
      <VerificationBadge v={p.verification}/>
      <h1 data-testid="text-programme-name">{p.name}</h1>
      <p className="prg-head-school"><Link href={`/university/${encodeURIComponent(p.institution.id)}`} data-testid="link-programme-university">{p.institution.name}</Link> · {p.institution.city ? `${p.institution.city}, ` : ''}{p.institution.country}</p>
      <p className="prg-head-facts">{[LEVEL_LABEL[p.level], p.language && `Taught in ${p.language}`, p.studyMode && STUDY_MODE_LABEL[p.studyMode], deadline.text].filter(Boolean).join(' · ')}</p>
    </header>

    <div className="prg-facts" data-testid="programme-facts">
      <div><span>Tuition</span><strong>{tuition ?? 'Not published'}</strong>{p.tuitionAmount != null && p.tuitionCurrency && <UsdHint amount={p.tuitionAmount} currency={p.tuitionCurrency}/>}{p.tuitionNote && <small>{p.tuitionNote}</small>}</div>
      <div><span>Duration</span><strong>{durationText(p.durationMonths) ?? 'Not published'}</strong></div>
      <div><span>Application fee</span><strong>{p.applicationFeeAmount != null && p.applicationFeeCurrency ? (p.applicationFeeAmount === 0 ? 'None' : money(p.applicationFeeAmount, p.applicationFeeCurrency)) : 'Not published'}</strong>{p.applicationFeeAmount ? <small>Paid to the university, not to UniPath</small> : null}</div>
      <div><span>Intakes</span><strong>{p.intakes.length ? p.intakes.join(', ') : 'Not published'}</strong></div>
    </div>

    <div className="prg-columns">
      <div className="prg-main">
        <section className={`prg-panel prg-verify prg-verify-${p.verification.level}`} data-testid="panel-verification">
          <h2>{p.verification.level === 'confirmed' ? <BadgeCheck size={18}/> : <CircleDashed size={18}/>} {p.verification.label}</h2>
          <p>{p.verification.detail}</p>
          {p.verification.level === 'confirmed' && p.confirmationNote && <p className="prg-muted">How: {p.confirmationNote}</p>}
          <p className="prg-links"><a href={p.sourceUrl} target="_blank" rel="noreferrer">Where these details come from <ExternalLink size={12}/></a>{p.officialUrl !== p.sourceUrl && <a href={p.officialUrl} target="_blank" rel="noreferrer">Official programme page <ExternalLink size={12}/></a>}</p>
        </section>

        <Documents programme={p}/>

        <section className="prg-panel" data-testid="panel-requirements"><h2>Entry requirements</h2>
          {p.academicRequirement || p.languageRequirement || p.otherRequirements ? <dl className="prg-table">
            {p.academicRequirement && <div><dt>Academic</dt><dd>{p.academicRequirement}</dd></div>}
            {p.minimumGpa != null && <div><dt>Minimum GPA</dt><dd>{p.minimumGpa.toFixed(2)} on a 4.0 scale, as published</dd></div>}
            {p.languageRequirement && <div><dt>Language</dt><dd>{p.languageRequirement}</dd></div>}
            {p.otherRequirements && <div><dt>Other</dt><dd>{p.otherRequirements}</dd></div>}
          </dl> : <p className="prg-muted">Not listed here. Check the official programme page.</p>}
        </section>

        <section className="prg-panel"><h2>Programme details</h2><dl className="prg-table">
          {p.degreeName && <div><dt>Degree</dt><dd>{p.degreeName}</dd></div>}
          <div><dt>Field of study</dt><dd>{p.field}</dd></div>
          <div><dt>Level</dt><dd>{LEVEL_LABEL[p.level]}</dd></div>
          {p.language && <div><dt>Language</dt><dd>{p.language}</dd></div>}
          {p.studyMode && <div><dt>Study mode</dt><dd>{STUDY_MODE_LABEL[p.studyMode]}</dd></div>}
          <div><dt>Deadline</dt><dd>{deadline.text}{p.deadlineNote ? ` · ${p.deadlineNote}` : ''}</dd></div>
          <div><dt>Last checked</dt><dd>{dateText(p.verification.checkedAt)}</dd></div>
        </dl></section>
      </div>

      <aside className="prg-aside">
        <ApplyBox programme={p}/>
        {q.data.similar.length > 0 && <section className="prg-similar"><h2>Similar programmes</h2>{q.data.similar.map(s => <ProgrammeCard key={s.id} p={s}/>)}</section>}
      </aside>
    </div>
  </div>;
}

function Documents({ programme: p }: { programme: Programme }) {
  const { isSignedIn } = useUser();
  const r = useGetProgrammeReadiness(p.id, { query: { queryKey: getGetProgrammeReadinessQueryKey(p.id), enabled: !!isSignedIn, retry: false } });
  const status = new Map((r.data?.documents ?? []).map(d => [d.kind, d]));
  return <section className="prg-panel" data-testid="panel-documents">
    <div className="prg-panel-head"><h2>Required documents</h2>{r.data && r.data.requiredCount > 0 && <span className="prg-ready" data-testid="text-document-readiness">{r.data.readyCount} / {r.data.requiredCount} ready</span>}</div>
    {p.requiredDocuments.length ? <ul className="prg-docs">{p.requiredDocuments.map(d => {
      const mine = status.get(d.kind);
      return <li key={d.kind} className={mine ? `prg-doc-${mine.status}` : ''}>
        <span className="prg-doc-icon">{mine?.status === 'ready' ? <Check size={14}/> : <FileText size={14}/>}</span>
        <div><strong>{DOCUMENT_KIND_LABEL[d.kind] ?? d.kind}</strong>{d.note && <small>{d.note}</small>}{mine?.status === 'ready' && <small className="prg-doc-mine">Yours: {mine.documentTitles.join(', ')}</small>}</div>
        <em>{d.need === 'required' ? 'Needed' : 'If it applies'}</em>
      </li>;
    })}</ul> : <p className="prg-muted">Not listed here. Check the official programme page.</p>}
    <p className="prg-muted">{isSignedIn
      ? <>Documents count as ready when you upload them with the matching type. <Link href="/documents">Manage your documents</Link></>
      : <><Link href="/sign-up">Create a free account</Link> to see which of these you already have.</>}</p>
  </section>;
}

function ApplyBox({ programme: p }: { programme: Programme }) {
  const { isSignedIn } = useUser();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const r = useGetProgrammeReadiness(p.id, { query: { queryKey: getGetProgrammeReadinessQueryKey(p.id), enabled: !!isSignedIn, retry: false } });
  const create = useCreateApplication();
  const deadline = deadlineText(p);
  const track = () => {
    if (!isSignedIn) { setLocation('/sign-up'); return; }
    const today = new Date().toISOString().slice(0, 10);
    create.mutate({ data: {
      universityId: p.institution.id, programName: p.name, status: 'interested',
      deadline: p.deadlineType === 'fixed' && p.deadline && p.deadline >= today ? p.deadline : undefined,
      applicationUrl: p.applyUrl ?? p.officialUrl, intake: p.intakes[0] ?? undefined,
      notes: `Added from the UniPath programme page (/programmes/${p.id}). Confirm the deadline and requirements on the university's website.`,
    } }, { onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getGetProgrammeReadinessQueryKey(p.id) });
      void qc.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
    } });
  };
  const tracked = r.data?.trackedApplicationId != null || create.isSuccess;
  const fit = r.data?.academic;
  return <section className="prg-apply" data-testid="panel-apply">
    <span className="eyebrow">APPLICATION</span>
    <div className="prg-apply-row"><span>Deadline</span><strong className={`prg-deadline-${deadline.tone}`}>{deadline.text}</strong></div>
    {tracked
      ? <Link href="/applications" className="button button-outline" data-testid="link-tracked"><Check size={15}/> In your tracker · open it</Link>
      : <button className="button button-primary" onClick={track} disabled={create.isPending} data-testid="button-track-programme">{create.isPending ? <LoaderCircle size={15} className="spin"/> : <ClipboardList size={15}/>} Track this programme</button>}
    {create.isError && <p className="form-error" role="alert">{errorMessage(create.error, 'It could not be added to your tracker. Please try again.')}</p>}
    <a href={p.applyUrl ?? p.officialUrl} target="_blank" rel="noreferrer" className="prg-apply-link" data-testid="link-apply">Apply on the university's website <ExternalLink size={13}/></a>
    <p className="prg-muted">You apply directly to the university. UniPath does not send applications.</p>
    {isSignedIn && r.data && <dl className="prg-readiness">
      {r.data.requiredCount > 0 && <div><dt>Documents</dt><dd>{r.data.readyCount} / {r.data.requiredCount} ready</dd></div>}
      {fit && fit.status !== 'not_published' && <div><dt>Academic fit</dt><dd className={`prg-fit-${fit.status}`}>{fit.status === 'meets' ? 'Meets the minimum' : fit.status === 'below' ? 'Below the minimum' : 'Add your GPA'}</dd></div>}
    </dl>}
    {fit && fit.status !== 'not_published' && <p className="prg-muted" data-testid="text-academic-fit">{fit.message}</p>}
    {!isSignedIn && p.minimumGpa != null && <p className="prg-muted">Published minimum GPA: {p.minimumGpa.toFixed(2)} / 4.0. <Link href="/sign-up">Sign up</Link> to compare it with yours. <ArrowRight size={12}/></p>}
  </section>;
}
