import { useState, type FormEvent } from 'react';
import {
  getGetFundingFinderOptionsQueryKey,
  useGetFundingFinderOptions,
  useGetFundingMatches,
} from '@workspace/api-client-react';
import type {
  FundingPotentialMatch,
  FundingStudentProfileInput,
} from '@workspace/api-client-react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  LockKeyhole,
  RotateCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import './funding-finder.css';

const EMPTY_PROFILE: FundingStudentProfileInput = { criteria: [] };

function displayDate(value?: string | null) {
  if (!value) return 'Not provided by source';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function FundingLead({ match }: { match: FundingPotentialMatch }) {
  const fact = match.opportunity;
  return <article className="funding-lead" data-testid={`funding-lead-${fact.id}`}>
    <div className="funding-lead-top">
      <div><span className="funding-lead-place">{match.countryCode}{match.city ? ` · ${match.city}` : ''}</span><h3>{fact.title}</h3><p className="funding-lead-school">{match.institutionName}</p></div>
      <span className={`funding-deadline funding-deadline-${match.deadlineStatus === 'Expired' ? 'expired' : match.deadlineStatus === 'Source-reported date' ? 'dated' : 'unknown'}`}>
        {match.deadlineStatus === 'Source-reported date' ? `Source-reported deadline · ${fact.deadline || 'date not provided'}` : match.deadlineStatus === 'Expired' ? 'Source-reported deadline has passed' : 'Deadline unknown'}
      </span>
    </div>
    {fact.awardAmount && <p className="funding-award">Source-reported amount: <strong>{fact.awardAmount}</strong></p>}
    <dl className="funding-lead-details">
      {fact.fundingCategory && <div><dt>Funding type</dt><dd>{fact.fundingCategory.replaceAll('-', ' ')}</dd></div>}
      {fact.applicantGroup && <div><dt>Applicant group</dt><dd>{fact.applicantGroup.replaceAll('-', ' ')}</dd></div>}
      {fact.eligibleDegreeLevels.length > 0 && <div><dt>Degree levels</dt><dd>{fact.eligibleDegreeLevels.join(', ')}</dd></div>}
      {fact.minimumGpa !== null && <div><dt>Minimum GPA as reported</dt><dd>{fact.minimumGpa.toFixed(2)} / {fact.minimumGpaScale || 'scale not reported'}</dd></div>}
      {fact.eligibleCitizenships.length > 0 && <div><dt>Eligible citizenships listed</dt><dd>{fact.eligibleCitizenships.join(', ')}</dd></div>}
      {fact.eligibleResidenceCountries.length > 0 && <div><dt>Residence countries listed</dt><dd>{fact.eligibleResidenceCountries.join(', ')}</dd></div>}
      {fact.eligibleResidenceRegions.length > 0 && <div><dt>Residence regions listed</dt><dd>{fact.eligibleResidenceRegions.join(', ')}</dd></div>}
      {fact.fieldsOfStudy.length > 0 && <div className="funding-detail-wide"><dt>Fields listed</dt><dd>{fact.fieldsOfStudy.join(', ')}</dd></div>}
      {fact.eligibleMajors.length > 0 && <div className="funding-detail-wide"><dt>Eligible majors listed</dt><dd>{fact.eligibleMajors.join(', ')}</dd></div>}
      {fact.eligibleCriteria.length > 0 && <div className="funding-detail-wide"><dt>Other criteria listed</dt><dd>{fact.eligibleCriteria.join('; ')}</dd></div>}
    </dl>
    {fact.eligibility && <div className="funding-source-criteria"><strong>Eligibility, as reported by the source</strong><p>{fact.eligibility}</p></div>}
    {match.matchedCriteria.length > 0 && <div className="funding-criteria-box funding-criteria-matched"><strong><CheckCircle2 size={15}/> Criteria that match the details you shared</strong><ul>{match.matchedCriteria.map(item => <li key={item}>{item}</li>)}</ul></div>}
    {match.unconfirmedCriteria.length > 0 && <div className="funding-criteria-box funding-criteria-unknown"><strong>Not confirmed from your details</strong><ul>{match.unconfirmedCriteria.map(item => <li key={item}>{item}</li>)}</ul><p>A missing or unconfirmed detail does not mean you are ineligible. Check the award provider’s full requirements.</p></div>}
    <div className="funding-lead-links">
      {fact.officialUrl ? <a className="funding-official-link" href={fact.officialUrl} target="_blank" rel="noreferrer">Open official opportunity page <ExternalLink size={14}/></a> : <span className="funding-no-official">No direct official page was provided for this record.</span>}
      <div className="funding-source-meta">
        <a href={fact.sourceUrl} target="_blank" rel="noreferrer">Source record: {fact.sourceName} <ExternalLink size={12}/></a>
        <span>Source date: {displayDate(fact.sourceDate)}</span>
        <span>Imported: {displayDate(fact.importedAt)}</span>
        <span>{fact.lastVerifiedAt ? `Independently verified: ${displayDate(fact.lastVerifiedAt)}` : 'Independent verification date: not recorded'}</span>
      </div>
    </div>
  </article>;
}

export function FundingFinder() {
  const options = useGetFundingFinderOptions({ query: { queryKey: getGetFundingFinderOptionsQueryKey() } });
  const matchRequest = useGetFundingMatches();
  const [profile, setProfile] = useState<FundingStudentProfileInput>(EMPTY_PROFILE);
  const [gpaText, setGpaText] = useState('');
  const [page, setPage] = useState(1);
  const verifiedCount = options.data?.verifiedOpportunityCount ?? 0;
  const change = <K extends keyof FundingStudentProfileInput>(key: K, value: FundingStudentProfileInput[K]) => setProfile(current => ({ ...current, [key]: value }));
  const requestPage = (requestedPage: number) => {
    if (!options.data || options.data.verifiedOpportunityCount < 1) return;
    const payload: FundingStudentProfileInput = {
      ...profile, criteria: profile.criteria || [], page: requestedPage, pageSize: 20,
    };
    if (gpaText !== '') payload.gpa = Number(gpaText);
    else delete payload.gpa;
    setPage(requestedPage);
    matchRequest.mutate({ data: payload });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    requestPage(1);
  };
  const toggleCriterion = (criterion: string) => {
    const selected = profile.criteria || [];
    change('criteria', selected.includes(criterion) ? selected.filter(value => value !== criterion) : [...selected, criterion]);
  };

  if (options.isLoading) return <div className="page page-enter funding-finder"><div className="funding-skeleton-title"/><div className="funding-skeleton-card"/><div className="funding-skeleton-card"/></div>;
  if (options.isError || !options.data) return <div className="page page-enter funding-finder"><section className="funding-state funding-state-error" role="alert"><div className="funding-state-icon"><RotateCw size={20}/></div><h2>Funding information did not load</h2><p>Try again in a moment. We won’t ask for any personal details until verified opportunities are available.</p><button className="button button-primary button-small" onClick={() => void options.refetch()} data-testid="button-retry-funding-options">Try again <ArrowRight size={15}/></button></section></div>;

  return <div className="page page-enter funding-finder">
    <header className="funding-heading">
      <div><div className="eyebrow">SOURCE-BACKED SUPPORT</div><h1>Find funding worth a closer look.</h1><p>We’ll only compare your details with recent, independently verified opportunities. A result is a lead to check—not a promise of eligibility or an award.</p></div>
      <div className="funding-heading-mark" aria-hidden="true"><Sparkles size={24}/><span>RESEARCH, NOT A GUARANTEE</span></div>
    </header>

    <section className="funding-trust-note" aria-label="How this finder works"><div className="funding-trust-icon"><ShieldCheck size={19}/></div><div><strong>Clear sources. No hidden scoring.</strong><p>We don’t rank your likelihood of receiving funding. The finder uses only facts the opportunity source reports, and keeps unknown details visibly unknown.</p></div><div className="funding-privacy"><LockKeyhole size={15}/> Details are used for this request only</div></section>

    <div className="funding-count-strip" aria-label="Funding record counts">
      <div><span>Independently verified</span><strong data-testid="text-verified-funding-count">{options.data.verifiedOpportunityCount}</strong></div>
      <div><span>Not independently verified</span><strong>{options.data.unverifiedOpportunityCount}</strong></div>
      <div><span>Expired records</span><strong>{options.data.expiredOpportunityCount}</strong></div>
      <p>Only recent verified records can be included in a potential match.</p>
    </div>

    {verifiedCount === 0 ? <section className="funding-empty" data-testid="empty-funding-opportunities">
      <div className="funding-empty-art"><div className="funding-empty-orbit orbit-a"/><div className="funding-empty-orbit orbit-b"/><div className="funding-empty-document"><FileCheck2 size={29}/><span/></div><i className="funding-empty-spark spark-a"/><i className="funding-empty-spark spark-b"/></div>
      <div className="funding-empty-copy"><span className="funding-empty-kicker">A careful beginning</span><h2>No verified opportunities to compare yet.</h2><p>There are currently no recent, independently verified scholarship or grant records in UniPath. We haven’t asked for your personal details, and there’s nothing to submit yet.</p><p>This doesn’t mean funding is unavailable. It means we don’t have verified opportunity records to responsibly compare.</p></div>
      <div className="funding-official-resources"><div><strong>Explore trusted starting points</strong><span>These are general official resources, not school-specific funding matches.</span></div>
        <a href="https://studentaid.gov/understand-aid/types/scholarships" target="_blank" rel="noreferrer" data-testid="link-us-scholarships">U.S. federal scholarship guidance <ExternalLink size={14}/></a>
        <a href="https://studentaid.gov/understand-aid/types/grants" target="_blank" rel="noreferrer">U.S. federal grant information <ExternalLink size={14}/></a>
        <a href="https://studentaid.gov/h/apply-for-aid/fafsa" target="_blank" rel="noreferrer">FAFSA application information <ExternalLink size={14}/></a>
        <a href="https://www.educanada.ca/scholarships-bourses/index.aspx?lang=eng" target="_blank" rel="noreferrer">Government of Canada scholarship listings <ExternalLink size={14}/></a>
      </div>
      <p className="funding-caveat">Official resource links are for your own research. A link does not mean a school, program, deadline, or eligibility rule has been verified.</p>
    </section> : <>
      <section className="funding-form-card">
        <div className="funding-form-intro"><span className="eyebrow">OPTIONAL DETAILS</span><h2>What should we compare?</h2><p>Share only what you’re comfortable sharing. Leave anything blank if you’re unsure.</p></div>
        <form onSubmit={submit} className="funding-profile-form">
          <div className="funding-fields-grid">
            <label className="funding-field"><span>Applicant status</span><select value={profile.applicantStatus || ''} onChange={e => change('applicantStatus', e.target.value ? e.target.value as FundingStudentProfileInput['applicantStatus'] : undefined)}><option value="">Not sure / skip</option>{options.data.applicantStatuses.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="funding-field"><span>Where are you in your studies?</span><select value={profile.applicantGroup || ''} onChange={e => change('applicantGroup', e.target.value ? e.target.value as FundingStudentProfileInput['applicantGroup'] : undefined)}><option value="">Not sure / skip</option>{options.data.applicantGroups.map(value => <option key={value} value={value}>{value.replaceAll('-', ' ')}</option>)}</select></label>
            <label className="funding-field"><span>Citizenship</span><select value={profile.citizenship || ''} onChange={e => change('citizenship', e.target.value || undefined)}><option value="">Skip</option>{options.data.citizenships.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="funding-field"><span>Country where you live</span><select value={profile.residenceCountry || ''} onChange={e => change('residenceCountry', e.target.value || undefined)}><option value="">Skip</option>{options.data.residenceCountries.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="funding-field"><span>Region or state</span><select value={profile.residenceRegion || ''} onChange={e => change('residenceRegion', e.target.value || undefined)}><option value="">Skip</option>{options.data.residenceRegions.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="funding-field"><span>Degree level</span><select value={profile.degreeLevel || ''} onChange={e => change('degreeLevel', e.target.value || undefined)}><option value="">Skip</option>{options.data.degreeLevels.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="funding-field"><span>Field or major</span><input maxLength={160} value={profile.intendedMajor || ''} onChange={e => change('intendedMajor', e.target.value || undefined)} placeholder="Optional"/></label>
            <label className="funding-field"><span>GPA (U.S. 4.0 scale only)</span><input type="number" min="0" max="4" step="0.01" inputMode="decimal" value={gpaText} onChange={e => setGpaText(e.target.value)} placeholder="Optional"/><small>We don’t convert other grading scales.</small></label>
          </div>
          {options.data.criteria.length > 0 && <fieldset className="funding-criteria-fieldset"><legend>Optional source-supported details</legend><p>Choose only statements that fit you. A blank choice is not treated as a mismatch.</p><div className="funding-option-list">{options.data.criteria.map(criterion => <label key={criterion} className="funding-check-option"><input type="checkbox" checked={(profile.criteria || []).includes(criterion)} onChange={() => toggleCriterion(criterion)}/><span>{criterion}</span></label>)}</div></fieldset>}
          <div className="funding-submit-row"><span><LockKeyhole size={14}/> Sent once for this comparison; not saved to your profile or shared with external services.</span><button className="button button-primary" type="submit" disabled={matchRequest.isPending} data-testid="button-find-funding">{matchRequest.isPending ? 'Checking verified records…' : 'See potential leads'} <ArrowRight size={16}/></button></div>
        </form>
      </section>
       {matchRequest.isError && <section className="funding-inline-error" role="alert"><strong>We couldn’t compare funding records just now.</strong><p>Your details were not saved. Please try again.</p><button className="button button-outline button-small" onClick={() => requestPage(page)}>Try comparison again</button></section>}
       {matchRequest.data && <section className="funding-results" aria-live="polite"><div className="funding-results-heading"><div><span className="eyebrow">POTENTIAL LEADS</span><h2>{matchRequest.data.matchCount ? 'Worth checking with the provider.' : 'No potential leads from these details.'}</h2><p>{matchRequest.data.notice}</p></div><div className="funding-results-count">{matchRequest.data.matchCount}<span>{matchRequest.data.matchCount === 1 ? 'lead' : 'leads'}</span></div></div>
        {matchRequest.data.matches.length ? <div className="funding-lead-list">{matchRequest.data.matches.map(match => <FundingLead key={`${match.institutionId}-${match.opportunity.id}`} match={match}/>)}</div> : <div className="funding-no-matches"><strong>This is not an eligibility decision.</strong><p>Unknown or missing criteria do not mean you are ineligible. Consider checking the official resources above or contacting an award provider directly.</p></div>}
         {matchRequest.data.totalPages > 1 && <nav className="pagination-bar" aria-label="Funding results pages"><button className="button button-outline button-small" disabled={page <= 1 || matchRequest.isPending} onClick={() => requestPage(page - 1)}><ArrowLeft size={14}/> Previous</button><span>Page {page} of {matchRequest.data.totalPages}</span><button className="button button-outline button-small" disabled={page >= matchRequest.data.totalPages || matchRequest.isPending} onClick={() => requestPage(page + 1)}>Next <ArrowRight size={14}/></button></nav>}
        <p className="funding-caveat">A potential lead is not a statement that you meet every requirement or will receive an award. Verify the current rules and deadline with the provider.</p>
      </section>}
    </>}
    <footer className="funding-page-foot"><ShieldCheck size={15}/> We show what sources say, when they said it, and what remains unknown.</footer>
  </div>;
}
