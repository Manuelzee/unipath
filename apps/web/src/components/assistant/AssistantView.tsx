import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getGetAiStatusQueryKey, getListAiSavedItemsQueryKey, getListSavedUniversitiesQueryKey,
  useAskAiAssistant, useDeleteAiSavedItem, useGetAiStatus, useListAiSavedItems, useListSavedUniversities, useReviewEssay, useSaveAiItem,
} from '@workspace/api-client-react';
import type { AiReply, AiSavedItemInputKind, AiStatus, SavedUniversity } from '@workspace/api-client-react';
import {
  ArrowRight, BookmarkCheck, Check, FileText, Lock, MessageCircle, PenLine, Send, ShieldCheck, Sparkles, Trash2, X,
} from 'lucide-react';
import { ErrorBlock, LoadingBlock } from '@/components/directory/StateViews';
import { PageHeading, cn, errorCode, errorMessage, safeHref } from '@/components/workspace/shared';

type Tab = 'ask' | 'essay' | 'saved';

export function AssistantView() {
  const status = useGetAiStatus({ query: { queryKey: getGetAiStatusQueryKey(), staleTime: 15_000 } });
  const savedItems = useListAiSavedItems({ query: { queryKey: getListAiSavedItemsQueryKey() } });
  const shortlist = useListSavedUniversities({ query: { queryKey: getListSavedUniversitiesQueryKey() } });
  const [tab, setTab] = useState<Tab>('ask');
  const s = status.data;

  return <div className="page page-enter">
    <PageHeading kicker="AI ASSISTANT · ADVISORY ONLY" title="Let’s make it clearer."
      body="Plain-language help with requirements, profile gaps, planning and essays. You stay in control: nothing is saved unless you review and approve it."/>
    {status.isLoading ? <LoadingBlock/> : status.isError ? <ErrorBlock retry={() => void status.refetch()}/> : s && <>
      {s.configured ? <div className="assistant-alert" data-testid="status-ai-connected"><div className="assistant-alert-icon"><Sparkles size={19}/></div><div>
        <strong>AI suggestions, not official advice.</strong><p>{s.notice} It never guarantees admission and never submits anything for you.</p>
        <p className="ai-usage" data-testid="text-ai-usage">{s.remainingToday} of {s.dailyLimit} requests left today ({planName(s.plan)} plan). Resets at 00:00 UTC.</p></div></div>
        : <div className="assistant-alert" data-testid="status-ai-not-connected"><div className="assistant-alert-icon"><MessageCircle size={19}/></div><div>
          <strong>The AI assistant isn’t connected yet.</strong><p>{s.notice} Meanwhile, the prepared examples below show the kind of guidance it will give.</p></div></div>}

      <div className="ws-tabs" role="tablist" aria-label="Assistant tools" style={{ marginTop: 17 }}>
        <TabButton id="ask" tab={tab} setTab={setTab} icon={<MessageCircle size={15}/>} label="Ask a question"/>
        <TabButton id="essay" tab={tab} setTab={setTab} icon={<PenLine size={15}/>} label="Essay feedback"/>
        <TabButton id="saved" tab={tab} setTab={setTab} icon={<BookmarkCheck size={15}/>} label={`Saved notes${savedItems.data?.length ? ` (${savedItems.data.length})` : ''}`}/>
      </div>

      <div className="ai-layout">
        <section className="assistant-main" role="tabpanel" id={`panel-ai-${tab}`} aria-labelledby={`tab-ai-${tab}`}>
          {tab === 'ask' && (s.configured ? <AskPanel status={s} shortlist={shortlist.data ?? []}/> : <PreparedExamples/>)}
          {tab === 'essay' && (s.configured ? <EssayPanel shortlist={shortlist.data ?? []}/> : <NotConnectedNote what="Essay feedback"/>)}
          {tab === 'saved' && <SavedPanel/>}
        </section>
        <aside className="assistant-sidebar">
          <div className="assistant-side-card"><span className="eyebrow">KEEP IN MIND</span><ul>
            <li><Check size={15}/> AI can be wrong. Check every fact against the official source it cites.</li>
            <li><Check size={15}/> Requirements, fees and deadlines vary by program and change each year.</li>
            <li><Check size={15}/> Essay feedback suggests improvements. Your essay stays your own words.</li>
            <li><Check size={15}/> You apply directly to each institution.</li>
          </ul><Link href="/applications">Open my applications <ArrowRight size={14}/></Link></div>
          <div className="assistant-side-card" style={{ marginTop: 12 }}><span className="eyebrow">WHAT IS SHARED</span>
            <p className="ws-muted" style={{ margin: '10px 0 8px' }}>With “Use my profile” on, only these fields go to {s.provider}:</p>
            <ul style={{ margin: 0, gap: 6 }}>{s.profileFieldsShared.map(f => <li key={f}><Check size={13}/> {f}</li>)}</ul>
            <div className="assistant-side-note"><Lock size={16}/><p>Your budget, living-cost estimates, citizenship and region are never sent. UniPath doesn’t store your questions or essays; only notes you approve are saved.</p></div>
          </div>
        </aside>
      </div>
    </>}
  </div>;
}

const planName = (plan: string) => plan === 'student-plus' ? 'Student Plus' : plan === 'premium' ? 'Premium' : 'Free';

function TabButton({ id, tab, setTab, icon, label }: { id: Tab; tab: Tab; setTab: (t: Tab) => void; icon: ReactNode; label: string }) {
  return <button role="tab" id={`tab-ai-${id}`} aria-controls={`panel-ai-${id}`} aria-selected={tab === id} className="ws-tab" onClick={() => setTab(id)} data-testid={`tab-ai-${id}`}>{icon}{label}</button>;
}

function NotConnectedNote({ what }: { what: string }) {
  return <div className="fact-empty"><strong>{what} needs the AI provider</strong><p>It will appear here once the site owner connects an AI provider on the server. Nothing you type is sent anywhere until then.</p></div>;
}

/** The original prepared guidance, kept for when live AI is not configured. */
function PreparedExamples() {
  const prompts = ['What should I do first?', 'How do I compare schools?', 'What belongs on my application checklist?'];
  const answers = [
    'Start with what you already know: a subject that interests you, a few places you might live, or a field and degree level you prefer. Then search the institution directory (partial U.S. and Canada coverage) and save anything worth a second look. You do not need to decide everything today.',
    'Choose a few priorities before comparing: program fit, location, degree level, and student support are useful starting points. Use the Compare page for source-reported facts side by side, then use official school admissions and financial aid pages to verify requirements and funding opportunities.',
    'Most application journeys include researching requirements, preparing transcripts, planning language tests if needed, requesting recommendations, and drafting personal materials. Requirements vary widely, so use each school’s official admissions page as your source of truth. The Applications page can add a common document checklist you can edit.',
  ];
  const [selected, setSelected] = useState<number | null>(null);
  return <>
    <div className="assistant-welcome"><div className="assistant-spark"><Sparkles size={21}/></div><div><span className="eyebrow">PREPARED EXAMPLES</span><h2>What’s on your mind?</h2><p>Pick a question to see an example of the guidance you might find useful. These are written examples, not AI-generated answers.</p></div></div>
    <div className="prompt-list">{prompts.map((prompt, i) => <button className={cn('prompt-button', selected === i && 'prompt-selected')} onClick={() => setSelected(i)} key={prompt} data-testid={`button-prompt-${i}`}><span>{prompt}</span><ArrowRight size={17}/></button>)}</div>
    {selected !== null && <div className="assistant-answer page-enter"><div className="answer-label"><Sparkles size={15}/> SAMPLE RESPONSE</div><p>{answers[selected]}</p><span className="answer-caveat">Example only · not live AI advice</span></div>}
  </>;
}

type Turn = { id: number; role: 'user' | 'assistant'; content: string; reply?: AiReply };
const STARTERS = [
  'Explain the admission requirements for the schools I selected.',
  'What gaps do you see in my profile for my intended program?',
  'Make an application checklist for the schools I selected.',
  'How should I compare these schools for my situation?',
];

function UniversityPicker({ shortlist, selected, setSelected, max }: { shortlist: SavedUniversity[]; selected: string[]; setSelected: (ids: string[]) => void; max: number }) {
  if (!shortlist.length) return <p className="ai-disclosure">Save schools to your <Link href="/saved" className="text-link" style={{ display: 'inline' }}>shortlist</Link> to ask about specific institutions.</p>;
  return <div className="cmp-picker" style={{ marginTop: 8 }}>{shortlist.map(s => {
    const on = selected.includes(s.universityId);
    return <button type="button" key={s.universityId} className={cn('ws-chip-button', on && 'is-on')} aria-pressed={on} disabled={!on && selected.length >= max}
      onClick={() => setSelected(on ? selected.filter(x => x !== s.universityId) : [...selected, s.universityId])} data-testid={`button-ai-school-${s.universityId}`}>
      {on && <Check size={12}/>}{s.university.name}</button>;
  })}</div>;
}

function AskPanel({ status, shortlist }: { status: AiStatus; shortlist: SavedUniversity[] }) {
  const ask = useAskAiAssistant(); const qc = useQueryClient();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [useProfile, setUseProfile] = useState(true);
  const [schools, setSchools] = useState<string[]>([]);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [turns.length, ask.isPending]);

  const send = (text = input) => {
    const message = text.trim();
    if (!message || ask.isPending || message.length > 2000) return;
    const history = turns.slice(-10).map(t => ({ role: t.role, content: t.content.slice(0, 6000) }));
    setTurns(t => [...t, { id: nextId.current++, role: 'user', content: message }]);
    setInput('');
    ask.mutate({ data: { message, history, universityIds: schools, useProfile } }, {
      onSuccess: reply => {
        setTurns(t => [...t, { id: nextId.current++, role: 'assistant', content: reply.reply, reply }]);
        void qc.invalidateQueries({ queryKey: getGetAiStatusQueryKey() });
      },
      onError: error => { if (errorCode(error) === 'AI_NOT_CONFIGURED') void qc.invalidateQueries({ queryKey: getGetAiStatusQueryKey() }); },
    });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };
  const lastQuestion = [...turns].reverse().find(t => t.role === 'user')?.content ?? '';

  return <>
    <div className="ai-context">
      <div className="ai-context-row">
        <label className="ai-toggle"><input type="checkbox" checked={useProfile} onChange={e => setUseProfile(e.target.checked)} data-testid="checkbox-ai-use-profile"/> Use my profile for context</label>
        <span className="ai-usage">{status.remainingToday} requests left today</span>
      </div>
      <p className="ai-disclosure">{useProfile ? 'Your academic profile fields listed on the right are included. Budgets and citizenship never are.' : 'Your profile will not be sent. Answers will be more general.'}</p>
      <p className="ai-disclosure" style={{ marginTop: 10, fontWeight: 700, color: '#536b7b' }}>Schools to ask about (up to 3)</p>
      <UniversityPicker shortlist={shortlist} selected={schools} setSelected={setSchools} max={3}/>
    </div>

    {turns.length === 0 && <><div className="assistant-welcome"><div className="assistant-spark"><Sparkles size={21}/></div><div><span className="eyebrow">A GOOD PLACE TO BEGIN</span><h2>What’s on your mind?</h2><p>Ask anything about requirements, your profile, comparing schools or planning. Pick a school above for answers based on its records.</p></div></div>
      <div className="ai-starters" style={{ marginTop: 16 }}>{STARTERS.map((q, i) => <button key={q} className="prompt-button" onClick={() => send(q)} disabled={ask.isPending} data-testid={`button-ai-starter-${i}`}><span>{q}</span><ArrowRight size={16}/></button>)}</div></>}

    <div className="ai-thread" aria-live="polite" aria-busy={ask.isPending} data-testid="ai-thread">
      {turns.map((t, i) => t.role === 'user'
        ? <div key={t.id} className="ai-msg ai-msg-user">{t.content}</div>
        : <AiAnswer key={t.id} reply={t.reply!} kind="answer" defaultTitle={titleFrom(turns[i - 1]?.content ?? 'AI answer')}/>)}
      {ask.isPending && <div className="ai-msg ai-msg-ai"><div className="ai-label"><Sparkles size={13}/> THINKING</div><div className="skeleton skeleton-line" style={{ width: '70%' }}/></div>}
      {ask.isError && <div className="ai-error" role="alert">{errorMessage(ask.error, 'The assistant couldn’t answer just now. Please try again.')}
        {lastQuestion && <> <button className="ws-link" onClick={() => send(lastQuestion)}>Try again</button></>}</div>}
      <div ref={endRef}/>
    </div>

    <form className="ai-composer" onSubmit={(e: FormEvent) => { e.preventDefault(); send(); }}>
      <label htmlFor="ai-input" className="sr-only">Your question</label>
      <textarea id="ai-input" className="ws-textarea" maxLength={2000} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
        placeholder="Ask about requirements, your profile, deadlines or planning… (Enter to send, Shift+Enter for a new line)" data-testid="input-ai-message"/>
      <div className="ai-composer-foot">
        <span className="word-count">{input.length}/2000</span>
        {turns.length > 0 && <button type="button" className="ws-link ws-link-muted" onClick={() => { setTurns([]); ask.reset(); }} data-testid="button-ai-clear">Clear conversation</button>}
        <span className="ws-spacer"/>
        <button className="button button-primary button-small" disabled={!input.trim() || ask.isPending || status.remainingToday <= 0} data-testid="button-ai-send"><Send size={14}/> Send</button>
      </div>
    </form>
    <p className="ai-caveat" style={{ marginTop: 8 }}>This conversation lives only in this browser tab. Save any answer you want to keep.</p>
  </>;
}

const titleFrom = (text: string) => { const t = text.replace(/\s+/g, ' ').trim(); return t.length > 80 ? `${t.slice(0, 77)}…` : t || 'AI answer'; };

function AiAnswer({ reply, kind, defaultTitle }: { reply: AiReply; kind: AiSavedItemInputKind; defaultTitle: string }) {
  const [reviewing, setReviewing] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const sources = [...new Set(reply.grounding.map(f => safeHref(f.sourceUrl)).filter((u): u is string => !!u))];
  return <div className="ai-msg ai-msg-ai" data-testid="ai-answer">
    <div className="ai-label"><Sparkles size={13}/> AI-GENERATED SUGGESTION · {reply.model}</div>
    <div className="ai-text">{reply.reply}</div>
    <details className="ai-facts">
      <summary>Facts UniPath gave the AI ({reply.grounding.length})</summary>
      {reply.grounding.length ? <ol>{reply.grounding.map((f, i) => <li key={i}>
        <span className="fact-kind">{f.kind === 'profile' ? 'Your profile' : 'University record'}</span>
        <strong>{f.label}:</strong> {f.value}
        {f.asOf && <> · as of {f.asOf}</>}
        {safeHref(f.sourceUrl) && <> · <a href={safeHref(f.sourceUrl)!} target="_blank" rel="noopener noreferrer">source</a></>}
      </li>)}</ol> : <p className="ws-muted">No profile or university records were included, so this answer is general guidance only.</p>}
    </details>
    <p className="ai-caveat" style={{ marginTop: 10 }}>{reply.disclaimer} Numbers in [brackets] refer to the facts above.</p>
    {savedOk ? <p className="ai-caveat" style={{ color: '#23766b', fontWeight: 700 }}><Check size={12}/> Saved to your workspace (Saved notes tab).</p>
      : reviewing ? <ReviewAndSave kind={kind} defaultTitle={defaultTitle} content={reply.reply} sourceUrls={sources} onCancel={() => setReviewing(false)} onSaved={() => { setReviewing(false); setSavedOk(true); }}/>
        : <div className="ai-actions"><button className="button button-outline button-small" onClick={() => setReviewing(true)} data-testid="button-ai-review-save"><FileText size={14}/> Review &amp; save</button>
          <span className="ai-caveat">Nothing is saved until you approve it.</span></div>}
  </div>;
}

function ReviewAndSave({ kind, defaultTitle, content, sourceUrls, onCancel, onSaved }: {
  kind: AiSavedItemInputKind; defaultTitle: string; content: string; sourceUrls: string[]; onCancel: () => void; onSaved: () => void;
}) {
  const save = useSaveAiItem(); const qc = useQueryClient();
  const [title, setTitle] = useState(defaultTitle.slice(0, 160));
  const [text, setText] = useState(content);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !text.trim()) return;
    save.mutate({ data: { kind, title: title.trim(), content: text.trim(), sourceUrls: sourceUrls.slice(0, 20) } }, {
      onSuccess: () => { void qc.invalidateQueries({ queryKey: getListAiSavedItemsQueryKey() }); onSaved(); },
    });
  };
  return <form className="ai-review" onSubmit={submit} data-testid="form-ai-review">
    <p className="app-section-title" style={{ margin: 0 }}>REVIEW BEFORE SAVING · EDIT ANYTHING THAT ISN’T RIGHT</p>
    <label className="ws-label"><span>Title</span><input className="ws-input" maxLength={160} required value={title} onChange={e => setTitle(e.target.value)}/></label>
    <label className="ws-label"><span>Content</span><textarea className="ws-textarea" maxLength={20000} required value={text} onChange={e => setText(e.target.value)}/></label>
    <div className="ws-row">
      <button className="button button-primary button-small" disabled={save.isPending || !title.trim() || !text.trim()} data-testid="button-ai-approve"><Check size={14}/> {save.isPending ? 'Saving…' : 'Approve & save'}</button>
      <button type="button" className="ws-link ws-link-muted" onClick={onCancel}><X size={13}/> Discard</button>
    </div>
    {save.isError && <p className="form-error" role="alert">{errorMessage(save.error, 'We couldn’t save this. Please try again.')}</p>}
  </form>;
}

const FOCUS = [
  { key: 'grammar', label: 'Grammar' }, { key: 'clarity', label: 'Clarity' }, { key: 'organization', label: 'Organization' },
  { key: 'tone', label: 'Tone' }, { key: 'prompt_fit', label: 'Fit to prompt' },
] as const;
type FocusKey = typeof FOCUS[number]['key'];

function EssayPanel({ shortlist }: { shortlist: SavedUniversity[] }) {
  const review = useReviewEssay(); const qc = useQueryClient();
  const [essay, setEssay] = useState('');
  const [prompt, setPrompt] = useState('');
  const [school, setSchool] = useState('');
  const [focus, setFocus] = useState<FocusKey[]>(['grammar', 'clarity', 'organization', 'tone', 'prompt_fit']);
  const words = essay.trim() ? essay.trim().split(/\s+/).length : 0;
  const tooShort = essay.trim().length < 50;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (tooShort || review.isPending) return;
    review.mutate({ data: { essay, prompt: prompt.trim() || undefined, focus, universityId: school || undefined } }, {
      onSuccess: () => void qc.invalidateQueries({ queryKey: getGetAiStatusQueryKey() }),
    });
  };
  const schoolName = shortlist.find(s => s.universityId === school)?.university.name;
  return <>
    <div className="assistant-welcome"><div className="assistant-spark"><PenLine size={20}/></div><div><span className="eyebrow">ESSAY FEEDBACK</span><h2>Get feedback on a draft</h2><p>The assistant points out what works and what to improve. It won’t rewrite your essay or add experiences you didn’t write.</p></div></div>
    <form onSubmit={submit} style={{ marginTop: 18, display: 'grid', gap: 12 }} data-testid="form-essay-review">
      <div className="ws-form-grid">
        <label className="ws-label"><span>School (optional)</span><select className="ws-select" value={school} onChange={e => setSchool(e.target.value)} data-testid="select-essay-school">
          <option value="">Not for a specific school</option>{shortlist.map(s => <option key={s.universityId} value={s.universityId}>{s.university.name}</option>)}</select></label>
        <div className="ws-label"><span>Focus on</span><div className="focus-chips">{FOCUS.map(f => {
          const on = focus.includes(f.key);
          return <button type="button" key={f.key} className={cn('ws-chip-button', on && 'is-on')} aria-pressed={on}
            onClick={() => setFocus(on ? (focus.length > 1 ? focus.filter(x => x !== f.key) : focus) : [...focus, f.key])}>{f.label}</button>;
        })}</div></div>
        <label className="ws-label wide"><span>Essay prompt (optional)</span><textarea className="ws-textarea" style={{ minHeight: 60 }} maxLength={1000} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Paste the question you are answering" data-testid="input-essay-prompt"/></label>
        <label className="ws-label wide"><span>Your draft</span><textarea className="ws-textarea" style={{ minHeight: 260 }} maxLength={12000} required value={essay} onChange={e => setEssay(e.target.value)} placeholder="Paste your essay draft (at least 50 characters)" data-testid="input-essay"/>
          <small>{words} words · {essay.length}/12000 characters. Sent to the AI provider for this request only; UniPath doesn’t store it.</small></label>
      </div>
      <div className="ws-row"><button className="button button-primary" disabled={tooShort || review.isPending} data-testid="button-essay-submit">{review.isPending ? 'Reviewing…' : <>Get feedback <ArrowRight size={15}/></>}</button></div>
    </form>
    {review.isPending && <div className="ai-msg ai-msg-ai" style={{ marginTop: 16 }}><div className="ai-label"><Sparkles size={13}/> READING YOUR DRAFT</div><div className="skeleton skeleton-line" style={{ width: '70%' }}/></div>}
    {review.isError && <div className="ai-error" role="alert">{errorMessage(review.error, 'We couldn’t review this draft just now. Please try again.')}</div>}
    {review.data && !review.isPending && <div className="ai-thread"><AiAnswer reply={review.data} kind="essay_feedback" defaultTitle={`Essay feedback${schoolName ? ` · ${schoolName}` : ''} · ${new Date().toLocaleDateString()}`}/></div>}
  </>;
}

function SavedPanel() {
  const items = useListAiSavedItems({ query: { queryKey: getListAiSavedItemsQueryKey() } });
  const remove = useDeleteAiSavedItem(); const qc = useQueryClient();
  const [confirming, setConfirming] = useState<number | null>(null);
  if (items.isLoading) return <LoadingBlock/>;
  if (items.isError) return <ErrorBlock retry={() => void items.refetch()}/>;
  if (!items.data?.length) return <div className="fact-empty"><strong>No saved notes yet</strong><p>When an AI answer or essay feedback is useful, choose “Review &amp; save”, edit it if needed, and approve it. It will appear here.</p></div>;
  const kindLabel: Record<string, string> = { answer: 'Answer', checklist: 'Checklist', essay_feedback: 'Essay feedback', note: 'Note' };
  return <div data-testid="list-ai-saved">{items.data.map(item => <article key={item.id} className="ai-saved-item">
    <div className="ws-row"><h3>{item.title}</h3><span className="ws-spacer"/><span className="ws-chip">{kindLabel[item.kind] ?? item.kind}</span></div>
    <p className="ws-muted" style={{ margin: '4px 0 0' }}>Approved {new Date(item.createdAt).toLocaleString()} · AI-assisted, reviewed by you</p>
    <details><summary>Show content</summary><div className="ai-text">{item.content}</div>
      {item.sourceUrls.length > 0 && <div className="app-links" style={{ marginTop: 8 }}>{item.sourceUrls.map(u => safeHref(u) && <a key={u} href={safeHref(u)!} target="_blank" rel="noopener noreferrer" className="ws-link">{new URL(safeHref(u)!).hostname}</a>)}</div>}</details>
    <div className="ws-row" style={{ marginTop: 8 }}>{confirming === item.id
      ? <span className="confirm-inline">Delete this note? <button className="button button-danger button-small" disabled={remove.isPending} onClick={() => remove.mutate({ id: item.id }, { onSuccess: () => { setConfirming(null); void qc.invalidateQueries({ queryKey: getListAiSavedItemsQueryKey() }); } })}>Delete</button>
        <button className="ws-link ws-link-muted" onClick={() => setConfirming(null)}>Cancel</button></span>
      : <button className="ws-link ws-danger-link" onClick={() => setConfirming(item.id)} data-testid={`button-delete-ai-item-${item.id}`}><Trash2 size={13}/> Delete</button>}</div>
  </article>)}
    {remove.isError && <p className="form-error" role="alert">We couldn’t delete that note. Please try again.</p>}
    <div className="ws-notice"><ShieldCheck size={16}/><span>Saved notes are private to your account and included in your data export.</span></div>
  </div>;
}
