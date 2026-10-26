import { useState } from 'react';
import { getListUniversityFactsQueryKey, useListUniversityFacts } from '@workspace/api-client-react';
import type { InstitutionFact, ListUniversityFactsParams } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { formatDate } from './format';
import { ErrorBlock, LoadingBlock, Unknown } from './StateViews';

const PAGE_SIZE = 10;

function FactCard({ fact }: { fact: InstitutionFact }) {
  return <article className="fact-card" data-testid={`card-fact-${fact.id}`}>
    <h4>{fact.title}</h4>
    <dl className="fact-dl">
      {fact.kind === 'program' && <><div><dt>Program type</dt><dd>{fact.programType || <Unknown>Not reported</Unknown>}</dd></div><div><dt>Degree level</dt><dd>{fact.degreeLevel || <Unknown>Not reported</Unknown>}</dd></div></>}
      <div><dt>Language</dt><dd>{fact.language || <Unknown>Unknown</Unknown>}</dd></div>
      <div><dt>Applicant status</dt><dd>{fact.applicantStatuses.length ? fact.applicantStatuses.join(', ') : <Unknown>Not reported</Unknown>}</dd></div>
      {fact.kind === 'admissions' && <div><dt>Applicant group</dt><dd>{fact.applicantGroup ? fact.applicantGroup.replaceAll('-', ' ') : <Unknown>Not reported</Unknown>}</dd></div>}
      {fact.kind === 'admissions' && <div><dt>Requirement scope</dt><dd>{fact.admissionScope === 'school-general' ? 'School-general' : fact.admissionScope === 'program-specific' ? 'Program-specific' : <Unknown>Not reported</Unknown>}</dd></div>}
      {fact.kind === 'funding' && fact.fundingCategory && <div><dt>Funding type</dt><dd>{fact.fundingCategory.replaceAll('-', ' ')}</dd></div>}
      {fact.kind === 'funding' && fact.awardAmount && <div><dt>Source-reported award amount</dt><dd>{fact.awardAmount}</dd></div>}
      {fact.kind !== 'program' && <div><dt>Deadline</dt><dd>{fact.deadline || <Unknown>Not reported</Unknown>}</dd></div>}
      {fact.fieldsOfStudy.length > 0 && <div className="wide"><dt>Fields of study</dt><dd className="chip-row">{fact.fieldsOfStudy.map(f => <span key={f}>{f}</span>)}</dd></div>}
      {fact.kind !== 'program' && <div className="wide"><dt>Eligibility</dt><dd>{fact.eligibility || <Unknown>Not reported by source. Check the official page.</Unknown>}</dd></div>}
      {fact.kind === 'funding' && <>
        {fact.eligibleCitizenships.length > 0 && <div><dt>Citizenship criteria</dt><dd>{fact.eligibleCitizenships.join(', ')}</dd></div>}
        {fact.eligibleResidenceCountries.length > 0 && <div><dt>Residence countries</dt><dd>{fact.eligibleResidenceCountries.join(', ')}</dd></div>}
        {fact.eligibleResidenceRegions.length > 0 && <div><dt>Residence regions</dt><dd>{fact.eligibleResidenceRegions.join(', ')}</dd></div>}
        {fact.eligibleDegreeLevels.length > 0 && <div><dt>Degree levels</dt><dd>{fact.eligibleDegreeLevels.join(', ')}</dd></div>}
        {fact.eligibleMajors.length > 0 && <div><dt>Eligible majors listed</dt><dd>{fact.eligibleMajors.join(', ')}</dd></div>}
        {fact.minimumGpa !== null && <div><dt>Minimum GPA (source scale)</dt><dd>{fact.minimumGpa} / {fact.minimumGpaScale || 'scale not reported'}</dd></div>}
        {fact.eligibleCriteria.length > 0 && <div className="wide"><dt>Additional criteria listed</dt><dd><ul>{fact.eligibleCriteria.map(criterion => <li key={criterion}>{criterion}</li>)}</ul></dd></div>}
      </>}
      {fact.requirements.length > 0 && <div className="wide"><dt>Source-listed requirements</dt><dd><ul>{fact.requirements.map(r => <li key={r}>{r}</li>)}</ul></dd></div>}
    </dl>
    {fact.officialUrl ? <a className="source-link" href={fact.officialUrl} target="_blank" rel="noreferrer">Official page <ExternalLink size={13}/></a> : <p className="fact-muted">No official page link in source.</p>}
    <footer className="fact-source">
      <a href={fact.sourceUrl} target="_blank" rel="noreferrer">{fact.sourceName} <ExternalLink size={11}/></a>
      <span>Source date: {formatDate(fact.sourceDate) || 'not provided'}</span>
      <span>Imported: {formatDate(fact.importedAt)}</span>
      <span>{fact.lastVerifiedAt ? `Independently verified ${formatDate(fact.lastVerifiedAt)}` : 'Not independently verified'}</span>
      {fact.sourceLicenseUrl && <a href={fact.sourceLicenseUrl} target="_blank" rel="noreferrer">Source licence or terms</a>}
    </footer>
  </article>;
}

export function FactList({ institutionId, kind, emptyTitle, emptyBody }: { institutionId: string; kind: 'program' | 'admissions' | 'funding'; emptyTitle: string; emptyBody: string }) {
  const [page, setPage] = useState(1);
  const params: ListUniversityFactsParams = { institutionId, kind, page, pageSize: PAGE_SIZE };
  const q = useListUniversityFacts(params, { query: { queryKey: getListUniversityFactsQueryKey(params), enabled: !!institutionId } });
  if (q.isLoading) return <LoadingBlock label={`Loading ${kind} records`}/>;
  if (q.isError || !q.data) return <ErrorBlock retry={() => void q.refetch()} title="Source records didn’t load"/>;
  if (!q.data.items.length) return <div className="fact-empty" data-testid={`empty-facts-${kind}`}><strong>{emptyTitle}</strong><p>{emptyBody}</p></div>;
  const pages = Math.max(1, Math.ceil(q.data.total / PAGE_SIZE));
  return <div className="fact-list" aria-busy={q.isFetching}>
    <p className="fact-count">{q.data.total.toLocaleString()} source-reported {q.data.total === 1 ? 'record' : 'records'}</p>
    {q.data.items.map(f => <FactCard key={f.id} fact={f}/>)}
    {pages > 1 && <div className="pagination-bar"><button className="button button-outline button-small" disabled={page <= 1 || q.isFetching} onClick={() => setPage(p => p - 1)} data-testid={`button-facts-prev-${kind}`}><ArrowLeft size={14}/> Previous</button><span>Page {page} of {pages}</span><button className="button button-outline button-small" disabled={page >= pages || q.isFetching} onClick={() => setPage(p => p + 1)} data-testid={`button-facts-next-${kind}`}>Next <ArrowRight size={14}/></button></div>}
  </div>;
}
