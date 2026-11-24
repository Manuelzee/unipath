import { type FormEvent, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListAnnouncementsQueryKey, useCreateAnnouncement, useDeleteAnnouncement, useListAnnouncements,
} from '@workspace/api-client-react';
import { LoaderCircle, Megaphone, Send, Trash2 } from 'lucide-react';
import { useUser } from '@/lib/auth';
import { PageHeading, errorMessage } from '@/components/workspace/shared';

/**
 * Announcements from the UniPath team. Which ones a student has seen is kept
 * per account in this browser, only to show the "new" badge in the sidebar.
 */
const SEEN_EVENT = 'unipath:announcements-seen';
const seenKey = (userId: string) => `unipath:announcements:seen:${userId}`;
function readSeen(userId: string): number {
  try { return Number(window.localStorage.getItem(seenKey(userId))) || 0; } catch { return 0; }
}
function markSeen(userId: string, id: number) {
  try {
    if (id > readSeen(userId)) { window.localStorage.setItem(seenKey(userId), String(id)); window.dispatchEvent(new Event(SEEN_EVENT)); }
  } catch { /* storage unavailable: the badge simply stays */ }
}

const BADGE_PARAMS = { limit: 20 };
/** How many announcements this student has not opened yet (for the sidebar badge). */
export function useUnreadAnnouncements(): number {
  const { user, isSignedIn } = useUser();
  const latest = useListAnnouncements(BADGE_PARAMS, { query: {
    queryKey: getListAnnouncementsQueryKey(BADGE_PARAMS), enabled: !!isSignedIn, staleTime: 60_000, refetchInterval: 120_000, retry: false,
  } });
  const [, rerender] = useState(0);
  useEffect(() => {
    const update = () => rerender(n => n + 1);
    window.addEventListener(SEEN_EVENT, update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener(SEEN_EVENT, update); window.removeEventListener('storage', update); };
  }, []);
  if (!user) return 0;
  const seen = readSeen(user.id);
  return (latest.data?.items ?? []).filter(item => item.id > seen).length;
}

const PAGE_PARAMS = { limit: 50 };
const dateLabel = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function AnnouncementsView() {
  const { user } = useUser();
  const qc = useQueryClient();
  const key = getListAnnouncementsQueryKey(PAGE_PARAMS);
  const list = useListAnnouncements(PAGE_PARAMS, { query: { queryKey: key, refetchInterval: 60_000 } });
  // What was already seen before this visit, so new items can be marked.
  const [seenBefore] = useState(() => (user ? readSeen(user.id) : 0));
  const newest = list.data?.items[0]?.id;
  useEffect(() => { if (user && newest) markSeen(user.id, newest); }, [user, newest]);

  const refresh = () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: getListAnnouncementsQueryKey(BADGE_PARAMS) }); };
  const remove = useDeleteAnnouncement();
  const [confirming, setConfirming] = useState<number | null>(null);
  useEffect(() => { if (confirming === null) return; const t = setTimeout(() => setConfirming(null), 4000); return () => clearTimeout(t); }, [confirming]);
  const deleteItem = (id: number) => {
    if (confirming !== id) { setConfirming(id); return; }
    setConfirming(null);
    remove.mutate({ id }, { onSuccess: refresh });
  };

  return <div className="page page-enter">
    <PageHeading kicker="FROM THE UNIPATH TEAM" title="Announcements." body="News, deadlines and updates for every student on UniPath."/>
    {list.data?.canPost && <Composer onPublished={refresh}/>}
    <section className="ann-list" aria-label="Announcements">
      {list.isLoading ? <div className="state-card"><LoaderCircle size={20} className="spin"/></div>
        : list.isError ? <div className="state-card" role="alert"><h3>We couldn’t load announcements</h3><p>{errorMessage(list.error, 'Please try again.')}</p>
          <button className="button button-primary button-small" onClick={() => void list.refetch()}>Try again</button></div>
        : !list.data?.items.length ? <div className="state-card"><div className="state-icon"><Megaphone size={22}/></div><h3>No announcements yet</h3><p>News from the UniPath team will appear here.</p></div>
        : list.data.items.map(item => <article key={item.id} className="ws-panel ann-card" data-testid={`announcement-${item.id}`}>
          <div className="ann-head">
            <div className="ann-icon"><Megaphone size={17}/></div>
            <div className="ann-title"><h2>{item.title}</h2><span>UniPath team · <time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time></span></div>
            {item.id > seenBefore && <span className="ann-new">New</span>}
            {item.canDelete && <button className={`chat-delete ann-delete${confirming === item.id ? ' chat-delete-confirm' : ''}`} onClick={() => deleteItem(item.id)}
              aria-label={confirming === item.id ? 'Confirm removing this announcement' : 'Remove this announcement'} data-testid={`button-announcement-delete-${item.id}`}>
              <Trash2 size={14}/>{confirming === item.id && <span>Remove?</span>}</button>}
          </div>
          <p className="ann-body">{item.body}</p>
        </article>)}
      {remove.isError && <p className="form-error" role="alert">{errorMessage(remove.error, 'The announcement was not removed. Please try again.')}</p>}
    </section>
  </div>;
}

function Composer({ onPublished }: { onPublished: () => void }) {
  const create = useCreateAnnouncement();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    create.mutate({ data: { title: title.trim(), body: body.trim() } }, { onSuccess: () => { setTitle(''); setBody(''); onPublished(); } });
  };
  return <form className="ws-panel ann-composer" onSubmit={submit} aria-label="New announcement">
    <div className="ws-head"><div><span className="eyebrow">ADMINISTRATOR</span><h2>Post an announcement</h2><p>Every signed-in student will see it here, with a badge in their sidebar.</p></div></div>
    <label className="ws-label"><span>Title</span>
      <input className="ws-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} required data-testid="input-announcement-title"/></label>
    <label className="ws-label"><span>Message</span>
      <textarea className="ws-textarea" value={body} onChange={e => setBody(e.target.value)} maxLength={4000} rows={5} required data-testid="input-announcement-body"/>
      <small>{body.length}/4000</small></label>
    <div className="ws-row" style={{ justifyContent: 'flex-end' }}>
      <button className="button button-primary button-small" disabled={!title.trim() || !body.trim() || create.isPending} data-testid="button-announcement-publish">
        {create.isPending ? <><LoaderCircle size={14} className="spin"/> Publishing…</> : <><Send size={14}/> Publish to all students</>}</button>
    </div>
    {create.isError && <p className="form-error" role="alert">{errorMessage(create.error, 'The announcement was not published. Please try again.')}</p>}
  </form>;
}
