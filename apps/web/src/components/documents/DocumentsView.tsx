import { type FormEvent, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearch } from 'wouter';
import {
  getListApplicationsQueryKey, getListStudentDocumentsQueryKey, uploadStudentDocument,
  useDeleteStudentDocument, useListApplications, useListStudentDocuments, useUpdateStudentDocument,
} from '@workspace/api-client-react';
import type { Application, StudentDocument } from '@workspace/api-client-react';
import { Download, FileImage, FileText, LoaderCircle, Lock, Pencil, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/directory/StateViews';
import { PageHeading, errorMessage } from '@/components/workspace/shared';
import { DOCUMENT_KIND_LABEL } from '@/components/programmes/format';

type Kind = NonNullable<StudentDocument['kind']>;
const KIND_OPTIONS = Object.entries(DOCUMENT_KIND_LABEL) as Array<[Kind, string]>;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.docx,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export const documentHref = (id: number) => `${base}/api/me/documents/${id}/file`;
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
const TYPE_LABEL: Record<string, string> = {
  'application/pdf': 'PDF', 'image/png': 'PNG image', 'image/jpeg': 'JPEG image',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word document',
};
const appName = (a: Application) => `${a.university?.name ?? 'Application'}${a.programName ? ` · ${a.programName}` : ''}`;

export function DocumentsView() {
  const docs = useListStudentDocuments({ query: { queryKey: getListStudentDocumentsQueryKey() } });
  const apps = useListApplications({ query: { queryKey: getListApplicationsQueryKey() } });
  const search = useSearch();
  const requestedApp = Number(new URLSearchParams(search).get('application')) || null;
  const list = docs.data ?? [];

  return <div className="page page-enter">
    <PageHeading kicker="PREPARE · PRIVATE TO YOU" title="Your documents."
      body="Keep transcripts, test reports and drafts in one private place, linked to the applications they support."/>
    <UploadPanel applications={apps.data ?? []} initialApplicationId={requestedApp} count={list.length}/>
    {docs.isLoading ? <LoadingBlock/> : docs.isError ? <ErrorBlock retry={() => void docs.refetch()}/> : !list.length
      ? <EmptyBlock testId="empty-documents" title="No documents yet" body="Upload a PDF, image or Word file above. Only you can open it."/>
      : <section className="ws-panel" data-testid="list-documents">
        <div className="ws-head"><div><span className="eyebrow">STORED PRIVATELY</span><h2>{list.length} document{list.length === 1 ? '' : 's'}</h2></div></div>
        {list.map(doc => <DocumentRow key={doc.id} doc={doc} applications={apps.data ?? []}/>)}
      </section>}
    <div className="ws-notice"><ShieldCheck size={16}/><span>Files are stored privately and only you can download them; they always download rather than open inside UniPath. Accepted: PDF, PNG, JPEG and Word (.docx), up to 10 MB each and 50 files. Files are not virus-scanned, so only upload files you trust. Deleting a document removes the file permanently, and “Delete my data” in Settings removes all of them.</span></div>
  </div>;
}

function UploadPanel({ applications, initialApplicationId, count }: { applications: Application[]; initialApplicationId: number | null; count: number }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [applicationId, setApplicationId] = useState<number | null>(initialApplicationId);
  const [kind, setKind] = useState<Kind | ''>('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const tooBig = !!file && file.size > MAX_UPLOAD_BYTES;
  const badType = !!file && !/\.(pdf|png|jpe?g|docx)$/i.test(file.name);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || tooBig || badType || busy) return;
    setBusy(true); setMessage(null);
    try {
      const doc = await uploadStudentDocument(file, { fileName: file.name, title: title.trim() || undefined, applicationId: applicationId ?? undefined, kind: kind || undefined });
      setMessage({ ok: true, text: `Uploaded “${doc.title}”.` });
      setFile(null); setTitle(''); setKind('');
      if (input.current) input.current.value = '';
      await qc.invalidateQueries({ queryKey: getListStudentDocumentsQueryKey() });
    } catch (error) {
      setMessage({ ok: false, text: errorMessage(error, 'The upload failed. Nothing was saved; please try again.') });
    } finally { setBusy(false); }
  };

  return <form className="ws-panel" onSubmit={e => void submit(e)} style={{ marginBottom: 16 }} data-testid="form-upload-document">
    <div className="ws-head"><div><span className="eyebrow">UPLOAD</span><h2>Add a document</h2><p>PDF, PNG, JPEG or Word (.docx), up to 10 MB. {count}/50 stored.</p></div><div className="profile-icon"><Lock size={19}/></div></div>
    <div className="ws-form-grid">
      <label className="ws-label wide"><span>File</span>
        <input ref={input} className="ws-input" type="file" accept={ACCEPT} onChange={e => { setFile(e.target.files?.[0] ?? null); setMessage(null); }} style={{ paddingTop: 7 }} data-testid="input-document-file"/>
        {file && <small>{file.name} · {formatBytes(file.size)}</small>}
        {tooBig && <small className="form-error" role="alert">This file is larger than 10 MB.</small>}
        {badType && <small className="form-error" role="alert">Only PDF, PNG, JPEG and .docx files are accepted.</small>}
      </label>
      <label className="ws-label"><span>What is it?</span>
        <select className="ws-select" value={kind} onChange={e => setKind(e.target.value as Kind | '')} data-testid="select-document-kind">
          <option value="">Choose a type (helps with programme checklists)</option>{KIND_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="ws-label"><span>Title (optional)</span><input className="ws-input" maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Final transcript" data-testid="input-document-title"/></label>
      <label className="ws-label"><span>Link to an application (optional)</span>
        <select className="ws-select" value={applicationId ?? ''} onChange={e => setApplicationId(e.target.value ? Number(e.target.value) : null)} data-testid="select-document-application">
          <option value="">Not linked</option>{applications.map(a => <option key={a.id} value={a.id}>{appName(a)}</option>)}</select></label>
    </div>
    <div className="ws-row" style={{ marginTop: 14 }}>
      <button className="button button-primary button-small" disabled={!file || tooBig || badType || busy || count >= 50} data-testid="button-upload-document">
        {busy ? <><LoaderCircle size={14} className="spin"/> Uploading…</> : <><Upload size={14}/> Upload</>}</button>
      {message && <span role="status" className={message.ok ? 'ws-muted' : 'form-error'} style={{ margin: 0 }}>{message.text}</span>}
    </div>
  </form>;
}

function DocumentRow({ doc, applications }: { doc: StudentDocument; applications: Application[] }) {
  const qc = useQueryClient();
  const update = useUpdateStudentDocument(); const remove = useDeleteStudentDocument();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(doc.title);
  const [confirming, setConfirming] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: getListStudentDocumentsQueryKey() });
  const Icon = doc.contentType.startsWith('image/') ? FileImage : FileText;
  return <div className="doc-row" data-testid={`document-${doc.id}`}>
    <span className="activity-dot"><Icon size={15}/></span>
    <div className="doc-main">
      {editing ? <form className="ws-row" onSubmit={e => { e.preventDefault(); if (title.trim()) update.mutate({ id: doc.id, data: { title: title.trim() } }, { onSuccess: () => { setEditing(false); refresh(); } }); }}>
        <input className="ws-input" style={{ flex: '1 1 200px' }} maxLength={160} value={title} onChange={e => setTitle(e.target.value)} aria-label="Document title" autoFocus/>
        <button className="button button-primary button-small" disabled={update.isPending}>Save</button>
        <button type="button" className="ws-link ws-link-muted" onClick={() => { setEditing(false); setTitle(doc.title); }}><X size={13}/> Cancel</button></form>
        : <strong>{doc.title}</strong>}
      <span>{doc.fileName} · {TYPE_LABEL[doc.contentType] ?? doc.contentType} · {formatBytes(doc.sizeBytes)} · added {new Date(doc.createdAt).toLocaleDateString()}</span>
      <label className="doc-link"><span className="sr-only">Type of {doc.title}</span>
        <select className="ws-select" value={doc.kind ?? ''} disabled={update.isPending} data-testid={`select-kind-${doc.id}`}
          onChange={e => update.mutate({ id: doc.id, data: { kind: (e.target.value || null) as Kind | null } }, { onSuccess: refresh })}>
          <option value="">Type not set</option>{KIND_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="doc-link"><span className="sr-only">Linked application for {doc.title}</span>
        <select className="ws-select" value={doc.applicationId ?? ''} disabled={update.isPending}
          onChange={e => update.mutate({ id: doc.id, data: { applicationId: e.target.value ? Number(e.target.value) : null } }, { onSuccess: () => { refresh(); void qc.invalidateQueries({ queryKey: getListApplicationsQueryKey() }); } })}>
          <option value="">Not linked to an application</option>{applications.map(a => <option key={a.id} value={a.id}>{appName(a)}</option>)}</select></label>
      {(update.isError || remove.isError) && <span className="form-error" role="alert">{errorMessage(update.error ?? remove.error, 'That change didn’t save.')}</span>}
    </div>
    <div className="doc-actions">
      <a className="button button-outline button-small" href={documentHref(doc.id)} download data-testid={`link-download-${doc.id}`}><Download size={14}/> Download</a>
      {!editing && <button className="icon-button" aria-label={`Rename ${doc.title}`} onClick={() => setEditing(true)}><Pencil size={14}/></button>}
      {confirming
        ? <span className="confirm-inline">Delete permanently?
            <button className="button button-danger button-small" disabled={remove.isPending} onClick={() => remove.mutate({ id: doc.id }, { onSuccess: refresh })} data-testid={`button-confirm-delete-${doc.id}`}>Delete</button>
            <button className="ws-link ws-link-muted" onClick={() => setConfirming(false)}>Cancel</button></span>
        : <button className="icon-button remove-icon" aria-label={`Delete ${doc.title}`} onClick={() => setConfirming(true)} data-testid={`button-delete-${doc.id}`}><Trash2 size={14}/></button>}
    </div>
  </div>;
}
