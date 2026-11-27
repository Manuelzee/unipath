import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import {
  getGetAdminAccessQueryKey, getGetAdminProgrammeQueryKey, getListAdminProgrammesQueryKey, getListUniversitiesQueryKey,
  useConfirmProgramme, useCreateProgramme, useGetAdminAccess, useGetAdminProgramme, useListAdminProgrammes,
  useListUniversities, useUpdateProgramme,
  type AdminProgramme, type ListAdminProgrammesStatus, type ProgrammeInput,
} from '@workspace/api-client-react';
import { ArrowLeft, BadgeCheck, ExternalLink, LoaderCircle, Plus, Search, Trash2 } from 'lucide-react';
import { AccessDenied } from '@/components/admin/AdminViews';
import { errorMessage } from '@/components/workspace/shared';
import { VerificationBadge } from './ProgrammeCard';
import { DOCUMENT_KIND_LABEL, LEVEL_LABEL, STUDY_MODE_LABEL } from './format';
import './programmes.css';
import './admin-programmes.css';

function AdminOnly({ children }: { children: ReactNode }) {
  const access = useGetAdminAccess({ query: { queryKey: getGetAdminAccessQueryKey() } });
  if (access.isLoading) return <div className="page"><div className="skeleton skeleton-card"/></div>;
  if (!access.data?.isAdmin) return <AccessDenied/>;
  return <>{children}</>;
}

export function AdminProgrammesView() { return <AdminOnly><ProgrammeList/></AdminOnly>; }
export function AdminProgrammeEditorView({ id }: { id: number | null }) { return <AdminOnly>{id ? <LoadAndEdit id={id}/> : <Editor/>}</AdminOnly>; }

function ProgrammeList() {
  const [search, setSearch] = useState(''); const [term, setTerm] = useState(''); const [status, setStatus] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  const params = { ...(term ? { search: term } : {}), ...(status ? { status: status as ListAdminProgrammesStatus } : {}) };
  const q = useListAdminProgrammes(params, { query: { queryKey: getListAdminProgrammesQueryKey(params) } });
  return <div className="page page-enter">
    <Link href="/admin" className="back-link"><ArrowLeft size={16}/> Back to admin</Link>
    <div className="page-heading"><div><div className="eyebrow">ADMIN · PROGRAMMES</div><h1>Programmes.</h1>
      <p>Add programmes from official university pages, keep them checked, and record when a university confirms the details in writing.</p></div>
      <Link href="/admin/programmes/new" className="button button-primary button-small" data-testid="link-new-programme"><Plus size={14}/> Add programme</Link></div>
    <div className="adp-filters">
      <label className="prg-search-main"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search programme, field or university" aria-label="Search programmes"/></label>
      <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
    </div>
    {q.isLoading ? <div className="skeleton skeleton-card"/> : q.isError || !q.data ? <p className="form-error">Programmes could not be loaded.</p>
      : q.data.items.length ? <div className="cmp-panel" style={{ padding: 0 }}><table className="cmp-table" data-testid="table-admin-programmes"><thead><tr><th>Programme</th><th>University</th><th>Status</th><th>Details</th><th>Updated</th><th/></tr></thead>
        <tbody>{q.data.items.map(p => <tr key={p.id}><td><strong>{p.name}</strong><br/><small>{LEVEL_LABEL[p.level]} · {p.field}</small></td><td>{p.institution.name}<br/><small>{p.institution.country}</small></td>
          <td><span className={`adp-status adp-status-${p.status}`}>{p.status}</span></td><td><VerificationBadge v={p.verification} compact/></td>
          <td>{new Date(p.updatedAt).toLocaleDateString()}</td><td><Link href={`/admin/programmes/${p.id}`} className="button button-outline button-small" data-testid={`link-edit-programme-${p.id}`}>Edit</Link></td></tr>)}</tbody></table></div>
      : <div className="state-card"><h3>No programmes yet</h3><p>Add the first one from a university's official programme page.</p><Link href="/admin/programmes/new" className="button button-primary button-small">Add programme</Link></div>}
  </div>;
}

function LoadAndEdit({ id }: { id: number }) {
  const q = useGetAdminProgramme(id, { query: { queryKey: getGetAdminProgrammeQueryKey(id) } });
  if (q.isLoading) return <div className="page"><div className="skeleton skeleton-card"/></div>;
  if (q.isError || !q.data) return <div className="page"><p className="form-error">This programme could not be loaded.</p><Link href="/admin/programmes">Back to programmes</Link></div>;
  return <Editor existing={q.data}/>;
}

const EMPTY: ProgrammeInput = {
  institutionId: '', name: '', level: 'bachelor', degreeName: null, field: '', language: 'English', durationMonths: null, studyMode: 'full_time',
  intakes: [], tuitionAmount: null, tuitionCurrency: null, tuitionPeriod: 'year', tuitionNote: null, applicationFeeAmount: null,
  applicationFeeCurrency: null, deadlineType: 'unknown', deadline: null, deadlineNote: null, academicRequirement: null,
  languageRequirement: null, otherRequirements: null, minimumGpa: null, requiredDocuments: [], officialUrl: '', applyUrl: null,
  sourceUrl: '', checkedAt: new Date().toISOString().slice(0, 10), status: 'draft',
};
function toInput(p: AdminProgramme): ProgrammeInput {
  return {
    institutionId: p.institution.id, name: p.name, level: p.level, degreeName: p.degreeName, field: p.field, language: p.language,
    durationMonths: p.durationMonths, studyMode: p.studyMode, intakes: p.intakes, tuitionAmount: p.tuitionAmount, tuitionCurrency: p.tuitionCurrency,
    tuitionPeriod: p.tuitionPeriod, tuitionNote: p.tuitionNote, applicationFeeAmount: p.applicationFeeAmount, applicationFeeCurrency: p.applicationFeeCurrency,
    deadlineType: p.deadlineType, deadline: p.deadline, deadlineNote: p.deadlineNote, academicRequirement: p.academicRequirement,
    languageRequirement: p.languageRequirement, otherRequirements: p.otherRequirements, minimumGpa: p.minimumGpa,
    requiredDocuments: p.requiredDocuments, officialUrl: p.officialUrl, applyUrl: p.applyUrl, sourceUrl: p.sourceUrl,
    checkedAt: p.verification.checkedAt, status: p.status,
  };
}

const num = (v: string) => v.trim() === '' ? null : Number(v);
const str = (v: string) => v.trim() === '' ? null : v;

function Field({ label, wide, hint, children }: { label: string; wide?: boolean; hint?: string; children: ReactNode }) {
  return <label className={`adp-field${wide ? ' adp-wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Editor({ existing }: { existing?: AdminProgramme }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState<ProgrammeInput>(existing ? toInput(existing) : EMPTY);
  const [schoolName, setSchoolName] = useState(existing ? `${existing.institution.name} · ${existing.institution.country}` : '');
  const [intakes, setIntakes] = useState((existing?.intakes ?? []).join(', '));
  const create = useCreateProgramme(); const update = useUpdateProgramme();
  const busy = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const set = <K extends keyof ProgrammeInput>(key: K, value: ProgrammeInput[K]) => setForm(f => ({ ...f, [key]: value }));
  const refresh = () => { void qc.invalidateQueries({ queryKey: getListAdminProgrammesQueryKey() }); };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const data: ProgrammeInput = { ...form, intakes: intakes.split(',').map(s => s.trim()).filter(Boolean).slice(0, 6),
      deadline: form.deadlineType === 'fixed' ? form.deadline : null };
    if (existing) update.mutate({ id: existing.id, data }, { onSuccess: saved => { refresh(); qc.setQueryData(getGetAdminProgrammeQueryKey(existing.id), saved); setForm(toInput(saved)); } });
    else create.mutate({ data }, { onSuccess: saved => { refresh(); setLocation(`/admin/programmes/${saved.id}`); } });
  };

  return <div className="page page-enter">
    <Link href="/admin/programmes" className="back-link"><ArrowLeft size={16}/> Programmes</Link>
    <div className="page-heading"><div><div className="eyebrow">ADMIN · PROGRAMMES</div><h1>{existing ? existing.name : 'Add a programme'}</h1>
      <p>Copy details only from the university's official pages. Leave a field empty when the university does not publish it; the site then says "Not published".</p></div>
      {existing && existing.status === 'published' && <Link href={`/programmes/${existing.id}`} className="button button-outline button-small">View public page <ExternalLink size={13}/></Link>}</div>

    {existing && <Confirmation programme={existing}/>}

    <form className="adp-form" onSubmit={submit} data-testid="form-programme">
      <fieldset><legend>University</legend>
        <UniversityPicker value={form.institutionId} label={schoolName} onPick={(id, label) => { set('institutionId', id); setSchoolName(label); }}/>
      </fieldset>

      <fieldset><legend>Programme</legend><div className="adp-grid">
        <Field label="Programme name" wide><input required minLength={2} maxLength={200} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. MSc Data Science" data-testid="input-programme-name"/></Field>
        <Field label="Level"><select value={form.level} onChange={e => set('level', e.target.value as ProgrammeInput['level'])}>{Object.entries(LEVEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Degree awarded"><input maxLength={200} value={form.degreeName ?? ''} onChange={e => set('degreeName', str(e.target.value))} placeholder="e.g. Master of Science"/></Field>
        <Field label="Field of study"><input required minLength={2} maxLength={120} value={form.field} onChange={e => set('field', e.target.value)} placeholder="e.g. Computer Science" data-testid="input-programme-field"/></Field>
        <Field label="Language of instruction"><input maxLength={60} value={form.language ?? ''} onChange={e => set('language', str(e.target.value))}/></Field>
        <Field label="Duration (months)"><input type="number" min={1} max={120} value={form.durationMonths ?? ''} onChange={e => set('durationMonths', num(e.target.value))}/></Field>
        <Field label="Study mode"><select value={form.studyMode ?? ''} onChange={e => set('studyMode', (e.target.value || null) as ProgrammeInput['studyMode'])}><option value="">Not published</option>{Object.entries(STUDY_MODE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Intakes" hint="Comma-separated, e.g. September 2027, January 2028"><input value={intakes} onChange={e => setIntakes(e.target.value)}/></Field>
      </div></fieldset>

      <fieldset><legend>Fees and deadline</legend><div className="adp-grid">
        <Field label="Tuition amount"><input type="number" min={0} step="0.01" value={form.tuitionAmount ?? ''} onChange={e => set('tuitionAmount', num(e.target.value))} placeholder="International fee"/></Field>
        <Field label="Currency"><input maxLength={3} value={form.tuitionCurrency ?? ''} onChange={e => set('tuitionCurrency', str(e.target.value.toUpperCase()))} placeholder="e.g. GBP"/></Field>
        <Field label="Per"><select value={form.tuitionPeriod ?? 'year'} onChange={e => set('tuitionPeriod', e.target.value as ProgrammeInput['tuitionPeriod'])}><option value="year">Year</option><option value="semester">Semester</option><option value="programme">Whole programme</option><option value="credit">Credit</option></select></Field>
        <Field label="Tuition note" wide hint="e.g. 2027/28 international fee; scholarships may reduce it"><input maxLength={300} value={form.tuitionNote ?? ''} onChange={e => set('tuitionNote', str(e.target.value))}/></Field>
        <Field label="Application fee"><input type="number" min={0} step="0.01" value={form.applicationFeeAmount ?? ''} onChange={e => set('applicationFeeAmount', num(e.target.value))} placeholder="0 if free"/></Field>
        <Field label="Fee currency"><input maxLength={3} value={form.applicationFeeCurrency ?? ''} onChange={e => set('applicationFeeCurrency', str(e.target.value.toUpperCase()))}/></Field>
        <Field label="Deadline"><select value={form.deadlineType} onChange={e => set('deadlineType', e.target.value as ProgrammeInput['deadlineType'])}><option value="unknown">Not published</option><option value="fixed">A date</option><option value="rolling">Rolling admissions</option></select></Field>
        {form.deadlineType === 'fixed' && <Field label="Deadline date"><input type="date" required value={form.deadline ?? ''} onChange={e => set('deadline', str(e.target.value))}/></Field>}
        <Field label="Deadline note" wide hint="e.g. for international applicants; earlier for scholarships"><input maxLength={200} value={form.deadlineNote ?? ''} onChange={e => set('deadlineNote', str(e.target.value))}/></Field>
      </div></fieldset>

      <fieldset><legend>Entry requirements</legend><div className="adp-grid">
        <Field label="Academic" wide><textarea rows={3} maxLength={2000} value={form.academicRequirement ?? ''} onChange={e => set('academicRequirement', str(e.target.value))}/></Field>
        <Field label="Language" wide><textarea rows={2} maxLength={2000} value={form.languageRequirement ?? ''} onChange={e => set('languageRequirement', str(e.target.value))} placeholder="e.g. IELTS 6.5 overall with no band below 6.0"/></Field>
        <Field label="Other" wide><textarea rows={2} maxLength={2000} value={form.otherRequirements ?? ''} onChange={e => set('otherRequirements', str(e.target.value))}/></Field>
        <Field label="Minimum GPA (4.0 scale)" hint="Only if the university publishes one on a 4.0 scale"><input type="number" min={0} max={4} step="0.01" value={form.minimumGpa ?? ''} onChange={e => set('minimumGpa', num(e.target.value))}/></Field>
      </div></fieldset>

      <fieldset><legend>Required documents</legend>
        {form.requiredDocuments.map((d, i) => <div className="adp-doc" key={i}>
          <select value={d.kind} onChange={e => set('requiredDocuments', form.requiredDocuments.map((x, j) => j === i ? { ...x, kind: e.target.value as typeof d.kind } : x))} aria-label="Document type">{Object.entries(DOCUMENT_KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select value={d.need} onChange={e => set('requiredDocuments', form.requiredDocuments.map((x, j) => j === i ? { ...x, need: e.target.value as typeof d.need } : x))} aria-label="Needed"><option value="required">Needed</option><option value="if_applicable">If it applies</option></select>
          <input maxLength={300} value={d.note ?? ''} onChange={e => set('requiredDocuments', form.requiredDocuments.map((x, j) => j === i ? { ...x, note: str(e.target.value) } : x))} placeholder="Plain-language note, e.g. scanned original as PDF" aria-label="Note"/>
          <button type="button" className="icon-button" aria-label="Remove document" onClick={() => set('requiredDocuments', form.requiredDocuments.filter((_, j) => j !== i))}><Trash2 size={14}/></button>
        </div>)}
        {form.requiredDocuments.length < 12 && <button type="button" className="button button-outline button-small" onClick={() => {
          const used = new Set(form.requiredDocuments.map(d => d.kind));
          const kind = (Object.keys(DOCUMENT_KIND_LABEL).find(k => !used.has(k as never)) ?? 'other') as ProgrammeInput['requiredDocuments'][number]['kind'];
          set('requiredDocuments', [...form.requiredDocuments, { kind, need: 'required', note: null }]);
        }} data-testid="button-add-document"><Plus size={13}/> Add a document</button>}
      </fieldset>

      <fieldset><legend>Source</legend><div className="adp-grid">
        <Field label="Official programme page" wide><input type="url" required maxLength={500} value={form.officialUrl} onChange={e => set('officialUrl', e.target.value)} placeholder="https://" data-testid="input-programme-official"/></Field>
        <Field label="Where you read these details" wide hint="Usually the same page; use the fees or requirements page if that is where the details are"><input type="url" required maxLength={500} value={form.sourceUrl} onChange={e => set('sourceUrl', e.target.value)} placeholder="https://" data-testid="input-programme-source"/></Field>
        <Field label="Application page (optional)" wide><input type="url" maxLength={500} value={form.applyUrl ?? ''} onChange={e => set('applyUrl', str(e.target.value))} placeholder="https://"/></Field>
        <Field label="Checked on"><input type="date" required value={form.checkedAt} max={new Date().toISOString().slice(0, 10)} onChange={e => set('checkedAt', e.target.value)}/></Field>
        <Field label="Status"><select value={form.status} onChange={e => set('status', e.target.value as ProgrammeInput['status'])} data-testid="select-programme-status"><option value="draft">Draft (only admins see it)</option><option value="published">Published</option><option value="archived">Archived (hidden)</option></select></Field>
      </div></fieldset>

      {existing?.verification.level === 'confirmed' && <p className="adp-warn">Changing any programme detail removes the university's confirmation. Status changes keep it.</p>}
      {error && <p className="form-error" role="alert">{errorMessage(error, 'The programme was not saved.')}</p>}
      {(create.isSuccess || update.isSuccess) && !busy && <p className="ws-muted" role="status">Saved.</p>}
      <button className="button button-primary" disabled={busy || !form.institutionId} data-testid="button-save-programme">{busy ? <LoaderCircle size={15} className="spin"/> : null} {existing ? 'Save changes' : 'Create programme'}</button>
      {!form.institutionId && <small className="ws-muted"> Choose a university first.</small>}
    </form>
  </div>;
}

function UniversityPicker({ value, label, onPick }: { value: string; label: string; onPick: (id: string, label: string) => void }) {
  const [search, setSearch] = useState(''); const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  const params = { search: term, pageSize: 8, sort: 'details' as const };
  const q = useListUniversities(params, { query: { queryKey: getListUniversitiesQueryKey(params), enabled: term.length >= 2 } });
  return <div className="adp-picker">
    {value && <p className="adp-picked" data-testid="text-picked-university">Chosen: <strong>{label}</strong> <code>{value}</code></p>}
    <label className="prg-search-main"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={value ? 'Search to change the university' : 'Search the directory by university name'} aria-label="Search universities" data-testid="input-pick-university"/></label>
    {term.length >= 2 && <ul className="adp-results">{q.isLoading ? <li>Searching…</li> : (q.data?.items ?? []).map(u => <li key={u.id}>
      <button type="button" onClick={() => { onPick(u.id, `${u.name} · ${u.country}`); setSearch(''); }} data-testid={`button-pick-${u.id}`}><strong>{u.name}</strong><span>{[u.city, u.country].filter(Boolean).join(', ')}</span></button></li>)}
      {q.data && !q.data.items.length && <li>No university matches. It may not be in the directory.</li>}</ul>}
  </div>;
}

function Confirmation({ programme: p }: { programme: AdminProgramme }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const confirm = useConfirmProgramme();
  return <section className={`prg-panel prg-verify prg-verify-${p.verification.level}`} style={{ marginBottom: 16 }} data-testid="panel-confirmation">
    <h2><BadgeCheck size={18}/> University confirmation</h2>
    <p>{p.verification.detail}</p>
    {p.confirmationNote && <p className="prg-muted">Recorded: {p.confirmationNote}</p>}
    <form className="adp-confirm" onSubmit={e => { e.preventDefault(); confirm.mutate({ id: p.id, data: { note: note.trim() } }, { onSuccess: saved => { setNote(''); qc.setQueryData(getGetAdminProgrammeQueryKey(p.id), saved); void qc.invalidateQueries({ queryKey: getListAdminProgrammesQueryKey() }); } }); }}>
      <input value={note} onChange={e => setNote(e.target.value)} minLength={5} maxLength={500} required placeholder="How the university confirmed, e.g. email from the admissions office, 27 Nov 2026" aria-label="Confirmation note" data-testid="input-confirmation-note"/>
      <button className="button button-outline button-small" disabled={confirm.isPending || note.trim().length < 5} data-testid="button-confirm-programme">Record confirmation</button>
    </form>
    <p className="prg-muted">Only record this when the university confirmed the current details in writing. It shows as confirmed for 180 days.</p>
    {confirm.isError && <p className="form-error" role="alert">{errorMessage(confirm.error, 'The confirmation was not saved.')}</p>}
  </section>;
}
