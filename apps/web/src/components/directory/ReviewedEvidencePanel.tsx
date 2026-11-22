import { getGetPublicInstitutionVerificationQueryKey, useGetPublicInstitutionVerification } from '@workspace/api-client-react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { StatusPill } from '@/components/admin/AdminViews';
import { formatDate } from './format';
import { ErrorBlock, LoadingBlock } from './StateViews';

export function ReviewedEvidencePanel({ id }: { id: string }) {
  const q = useGetPublicInstitutionVerification(id, { query: { queryKey: getGetPublicInstitutionVerificationQueryKey(id), enabled: !!id, staleTime: 30_000, refetchOnMount: 'always' } });
  return <section className="detail-panel" data-testid="panel-reviewed-evidence">
    <span className="eyebrow">ADMIN-REVIEWED EVIDENCE</span>
    <p className="fact-row" style={{display:'block',color:'#758690',fontSize:11,lineHeight:1.6,marginTop:8}}>These fields were checked against an official source and approved by a UniPath reviewer. Coverage is limited to the specific fields listed. This is not a full verification of the school.</p>
    {q.isLoading ? <LoadingBlock label="Loading reviewed evidence"/> : q.isError || !q.data ? <ErrorBlock retry={() => void q.refetch()} title="Reviewed evidence is unavailable right now" body="We couldn’t load it. This doesn’t mean no evidence exists."/> :
      !q.data.fields.length ? <div className="adm-banner" style={{marginTop:12}} data-testid="text-no-reviewed-evidence"><ShieldCheck size={16}/><div>No admin-reviewed field evidence yet. The details on this page are source-reported and haven’t been independently checked.</div></div> :
      <div style={{display:'grid',gap:10,marginTop:12}}>{q.data.fields.map(f => <div className="adm-card" key={f.fieldKey} data-testid={`evidence-${f.fieldKey}`}>
        <div className="adm-actions" style={{justifyContent:'space-between'}}><strong style={{color:'#2b485d'}}>{f.title}</strong><StatusPill status={f.status}/></div>
        {f.value && <div style={{color:'#2e485a',fontSize:13}}>{f.value}</div>}
        {f.message && <div style={{color:/stale|failed/i.test(f.status)?'#8a5a22':'#758690'}}>{f.message}</div>}
        <div className="adm-actions" style={{justifyContent:'space-between'}}><span>Checked {f.checkedAt ? formatDate(f.checkedAt) : 'date not recorded'}</span>{f.sourceUrl && <a className="text-link" href={f.sourceUrl} target="_blank" rel="noreferrer">Official source <ExternalLink size={11}/></a>}</div>
      </div>)}</div>}
  </section>;
}
