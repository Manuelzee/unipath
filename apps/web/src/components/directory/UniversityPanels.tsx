import type { University } from '@workspace/api-client-react';
import { getGetDirectoryCoverageQueryKey, useGetDirectoryCoverage } from '@workspace/api-client-react';
import { ExternalRef, CANADA_REFERENCES } from './ExternalRef';
import { FactList } from './FactList';
import { UniversityScholarships } from '@/components/scholarships/UniversityScholarships';
import { formatDate, formatRate, regionName } from './format';
import { Unknown } from './StateViews';

const isCA = (s: University) => s.countryCode === 'CA';
const isUS = (s: University) => s.countryCode === 'US';

function Fact({ label, value, fallback = 'Not reported by source' }: { label: string; value?: string | null; fallback?: string }) {
  return <div><span>{label}</span><strong>{value || <Unknown>{fallback}</Unknown>}</strong></div>;
}

function NoWebsite({ school }: { school: University }) {
  return <p className="resource-copy">The imported source does not include an official website for this institution. We don’t guess web addresses from names or email domains. {isCA(school) ? 'Use the CICIC directory or the IRCC DLI list below to look it up yourself.' : 'Search the official source record below to find it.'}</p>;
}

export function OverviewPanel({ school }: { school: University }) {
  const metrics = [
    school.admissionRate != null ? { label: 'Admission rate', value: formatRate(school.admissionRate, school.admissionRateYear) } : null,
    school.completionRate != null ? { label: school.completionRateType || 'Completion rate', value: formatRate(school.completionRate, school.completionRateYear) } : null,
    school.pellGrantRate != null ? { label: 'Students receiving Pell Grants', value: formatRate(school.pellGrantRate, school.pellGrantRateYear) } : null,
  ].filter((m): m is { label: string; value: string } => m !== null);
  return <>
    <section className="detail-panel"><span className="eyebrow">INSTITUTION</span><div className="fact-grid">
      <Fact label="Country" value={school.country}/>
      <Fact label={isCA(school) ? 'Province or territory' : isUS(school) ? 'State or territory' : 'Region'} value={regionName(school.countryCode, school.state)}/>
      <Fact label="City" value={school.city}/>
      <Fact label="Institution type" value={school.institutionType}/>
      <Fact label="Ownership" value={school.ownership}/>
      <Fact label="Degree levels" value={school.degreeLevels.join(', ')}/>
      <Fact label="Instruction languages" value={school.languages.join(', ')} fallback="Unknown"/>
      <Fact label="Applicant statuses" value={school.applicantStatuses.join(', ')} fallback="Unknown"/>
      {isCA(school) && <Fact label="Listing status" value="Source-listed institution or campus"/>}{isCA(school) && <Fact label="Current operation and admissions" value={null} fallback="Not verified"/>}
      <Fact label="Independent verification" value={formatDate(school.lastVerifiedAt)} fallback="Unavailable"/>
      <Fact label="Recognition status" value={isCA(school) ? null : school.recognitionStatus} fallback="Not recorded in this directory"/>
      {isCA(school) && <Fact label="DLI number" value={school.dliNumber ? `${school.dliNumber}${school.dliVerifiedAt ? ` · checked ${formatDate(school.dliVerifiedAt)}` : ''}` : null} fallback="Unknown, not sourced"/>}
    </div>
    {school.sourceScope && <p className="scope-note"><strong>Source scope:</strong> {school.sourceScope}</p>}
    </section>
    {metrics.length > 0 && <section className="detail-panel"><span className="eyebrow">REPORTED OUTCOMES</span><div className="metric-grid">{metrics.map(m => <div className="metric-item" key={m.label}><span>{m.label}</span><strong>{m.value}</strong></div>)}</div><p className="metric-footnote">Figures are from the U.S. Department of Education College Scorecard, with their reporting years.</p></section>}
  </>;
}

export function FieldsPanel({ school }: { school: University }) {
  return <>
    <section className="detail-panel"><span className="eyebrow">SOURCE-LISTED PROGRAMS</span>{isCA(school) && <p className="resource-copy">Listed in a government co-op and internship program source. Not confirmed as currently offered.</p>}
      <FactList institutionId={school.id} kind="program" emptyTitle="No program records imported yet" emptyBody={isUS(school) ? 'U.S. program facts have not been imported. They will appear only when a permitted official source is validated. Nothing is inferred from the institution name.' : 'The imported source lists no programs for this institution. Programs are never inferred from names or titles.'}/>
    </section>
    {school.majors.length > 0 && <section className="detail-panel"><span className="eyebrow">FIELDS ON THE INSTITUTION RECORD ({school.majors.length})</span><div className="programs-list">{school.majors.map(m => <span key={m}>{m}</span>)}</div><p className="metric-footnote">May not reflect current availability. Confirm with the institution.</p></section>}
  </>;
}

export function AdmissionsPanel({ school }: { school: University }) {
  return <>
    <section className="detail-panel"><span className="eyebrow">SOURCE-REPORTED ADMISSIONS</span>
      <FactList institutionId={school.id} kind="admissions" emptyTitle="No admissions records in imported sources" emptyBody="Requirements, application details, deadlines and eligibility are not verified here. Check official admissions website."/>
    </section>
    <section className="detail-panel"><span className="eyebrow">WHERE TO CONFIRM</span>
      {school.admissionsWebsite && <ExternalRef href={school.admissionsWebsite} testId="link-admissions">Official admissions information</ExternalRef>}
      {school.applicationWebsite && <ExternalRef href={school.applicationWebsite} testId="link-application">Official application information</ExternalRef>}
      {!school.admissionsWebsite && !school.applicationWebsite && (school.website ? <ExternalRef href={school.website} note="No direct admissions page in source" testId="link-website-admissions">Official school website</ExternalRef> : <NoWebsite school={school}/>)}
      {isCA(school) && <><div className="resource-divider"/><p className="resource-copy"><strong>Studying in Canada as an international student</strong><br/>General government guidance, not specific to this institution.</p><ExternalRef href={CANADA_REFERENCES.studyPermit.href} note={CANADA_REFERENCES.studyPermit.note}>{CANADA_REFERENCES.studyPermit.label}</ExternalRef><ExternalRef href={CANADA_REFERENCES.dli.href} note={CANADA_REFERENCES.dli.note}>{CANADA_REFERENCES.dli.label}</ExternalRef></>}
      {school.admissionRate != null && <p className="metric-footnote">An admission rate is not an admissions requirement.</p>}
    </section>
  </>;
}

export function FundingPanel({ school }: { school: University }) {
  return <>
    <UniversityScholarships id={school.id}/>
    <section className="detail-panel"><span className="eyebrow">SOURCE-REPORTED FUNDING</span>
      <FactList institutionId={school.id} kind="funding" emptyTitle="No funding records in imported sources" emptyBody="This doesn’t mean no funding exists. It means our sources don’t report it. Check the official links below."/>
    </section>
    <section className="detail-panel"><span className="eyebrow">WHERE TO LOOK</span>
      {school.financialAidWebsite ? <ExternalRef href={school.financialAidWebsite} testId="link-financial-aid">School financial aid and funding page</ExternalRef> : school.website ? <ExternalRef href={school.website} note="No direct funding page in source" testId="link-website-funding">Official school website</ExternalRef> : <NoWebsite school={school}/>}
      {isCA(school) && <><div className="resource-divider"/><p className="resource-copy"><strong>Government of Canada</strong><br/>General scholarship listings. Eligibility is set by each award, not by this directory.</p><ExternalRef href={CANADA_REFERENCES.scholarships.href} note={CANADA_REFERENCES.scholarships.note} testId="link-educanada-scholarships">{CANADA_REFERENCES.scholarships.label}</ExternalRef></>}
      {isUS(school) && <><div className="resource-divider"/><p className="resource-copy"><strong>U.S. Department of Education</strong><br/>Federal aid has eligibility rules. General guidance, not school-specific listings.</p><ExternalRef href="https://studentaid.gov/understand-aid/types/scholarships">Official scholarship guidance</ExternalRef><ExternalRef href="https://studentaid.gov/understand-aid/types/grants">Federal grant information</ExternalRef><ExternalRef href="https://studentaid.gov/h/apply-for-aid/fafsa">FAFSA application information</ExternalRef></>}
      <p className="metric-footnote">No funding opportunity or award is guaranteed.</p>
    </section>
  </>;
}

export function LinksPanel({ school }: { school: University }) {
  const coverage = useGetDirectoryCoverage({ query: { queryKey: getGetDirectoryCoverageQueryKey() } });
  return <>
    <section className="detail-panel"><span className="eyebrow">INSTITUTION</span>
      {school.website ? <ExternalRef href={school.website} testId="link-official-website">Official school website</ExternalRef> : <NoWebsite school={school}/>}
      <ExternalRef href={school.sourceUrl} note={school.dataSource} testId="link-source-record">Official source record</ExternalRef>
      {school.sourceLicenseUrl && <ExternalRef href={school.sourceLicenseUrl}>Source licence and terms</ExternalRef>}
      {school.dliSourceUrl && <ExternalRef href={school.dliSourceUrl} note={school.dliVerifiedAt ? `Checked ${formatDate(school.dliVerifiedAt)}` : 'Check date not recorded'}>DLI source</ExternalRef>}
    </section>
    {isCA(school) && <section className="detail-panel"><span className="eyebrow">LOOK IT UP YOURSELF · CANADA</span><p className="resource-copy">External references only. Linking them is not a claim that this record has been checked against them.</p>
      {[CANADA_REFERENCES.cicic, CANADA_REFERENCES.educanada, CANADA_REFERENCES.dli].map(r => <ExternalRef key={r.href} href={r.href} note={r.note}>{r.label}</ExternalRef>)}
    </section>}
    {coverage.data && coverage.data.references.length > 0 && <section className="detail-panel"><span className="eyebrow">OTHER REFERENCE DIRECTORIES · NOT IMPORTED</span>{coverage.data.references.map(r => <ExternalRef key={r.name} href={r.url} note={r.access}>{r.name}</ExternalRef>)}</section>}
  </>;
}
