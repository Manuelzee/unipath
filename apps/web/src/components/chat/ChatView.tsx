import { type FormEvent, type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from 'wouter';
import {
  ApiError, getListChatMessagesQueryKey, getListChatRoomsQueryKey, listChatMessages, useDeleteChatMessage, useListChatMessages,
  useListChatRooms, useSendChatMessage,
} from '@workspace/api-client-react';
import type { ChatMessage, ChatMessagePage, ChatRoom } from '@workspace/api-client-react';
import { ArrowUp, Globe2, LoaderCircle, MapPin, MessagesSquare, ShieldCheck, Trash2 } from 'lucide-react';
import { PageHeading, errorMessage } from '@/components/workspace/shared';

const PAGE_SIZE = 50;
const GENERAL: ChatRoom = { id: 'general', name: 'General', kind: 'general' };
const MAX_LENGTH = 1000;
const POLL_MS = 4000;

/** Oldest first, one entry per id. */
const merge = (...lists: ChatMessage[][]) => [...new Map(lists.flat().map(m => [m.id, m])).values()].sort((a, b) => a.id - b.id);
const dayLabel = (iso: string) => {
  const date = new Date(iso); const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
// Countries whose English name takes "the" ("study in the United States").
const WITH_THE = new Set(['US', 'GB', 'NL', 'PH', 'AE', 'BS', 'GM', 'DO', 'MV', 'MH', 'SB', 'SC', 'CF', 'KM']);
/** "the United States" for "us"; the code itself if the browser does not know it. */
const countryLabel = (code: string) => {
  const upper = code.toUpperCase();
  let name = upper;
  try { name = regionNames.of(upper) ?? upper; } catch { /* unknown code */ }
  return WITH_THE.has(upper) ? `the ${name}` : name;
};
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Community chat: General for every student, plus a room for each country the
 * student plans to study in (from their profile). The server enforces which
 * rooms a student may read and post in.
 */
export function ChatView() {
  const rooms = useListChatRooms({ query: { queryKey: getListChatRoomsQueryKey(), staleTime: 60_000 } });
  const [, setLocation] = useLocation();
  const wanted = new URLSearchParams(useSearch()).get('room') ?? GENERAL.id;
  const list = rooms.data?.rooms ?? [GENERAL];
  const active = list.find(room => room.id === wanted) ?? list[0];
  const choose = (id: string) => setLocation(id === GENERAL.id ? '/chat' : `/chat?room=${encodeURIComponent(id)}`, { replace: true });
  return <div className="page page-enter chat-page">
    <PageHeading kicker="COMMUNITY" title="Student lounge." body="Swap tips, ask questions and meet other students heading to the same country."/>
    <div className="chat-rooms" role="tablist" aria-label="Chat rooms">
      {list.map(room => <button key={room.id} role="tab" aria-selected={room.id === active.id} className={`chat-room-tab${room.id === active.id ? ' chat-room-active' : ''}`}
        onClick={() => choose(room.id)} data-testid={`tab-room-${room.id}`}>
        {room.kind === 'country' ? <MapPin size={14}/> : <Globe2 size={14}/>}{room.name}</button>)}
    </div>
    <p className="chat-room-hint" data-testid="text-room-hint">
      {active.kind === 'country' ? <>For students planning to study in {countryLabel(active.id)}.{rooms.data?.isAdmin ? ' You can see every country room as an administrator.' : ''}</>
        : rooms.data && !rooms.data.studyCountryKnown ? <>Everyone is welcome here. Add the country you plan to study in to <Link href="/profile" className="text-link-inline">your profile</Link> to also join its room, such as US students.</>
        : <>Everyone is welcome here. Your country rooms are in the tabs above.</>}
    </p>
    <RoomFeed key={active.id} room={active}/>
    <div className="ws-notice"><ShieldCheck size={16}/><span>Every signed-in student in a room can read it. Others see only your first name and last initial. Be kind, and never share passwords, codes or contact details here.</span></div>
  </div>;
}

function RoomFeed({ room }: { room: ChatRoom }) {
  const qc = useQueryClient();
  const params = { room: room.id, limit: PAGE_SIZE };
  const key = getListChatMessagesQueryKey(params);
  const latest = useListChatMessages(params, { query: { queryKey: key, refetchInterval: POLL_MS, retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 2 } });
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const messages = useMemo(() => merge(older, latest.data?.items ?? []), [older, latest.data]);
  const hasMore = olderHasMore ?? latest.data?.hasMore ?? false;

  const list = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const keepOffset = useRef<number | null>(null);
  const lastId = messages.at(-1)?.id;
  // New messages scroll into view only if the reader is already at the bottom.
  useEffect(() => {
    if (stickToBottom.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [lastId]);
  // Loading earlier messages keeps the reader's place.
  useLayoutEffect(() => {
    if (keepOffset.current !== null && list.current) {
      list.current.scrollTop = list.current.scrollHeight - keepOffset.current;
      keepOffset.current = null;
    }
  }, [older]);
  const onScroll = () => {
    const el = list.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = async () => {
    const first = messages[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true); setOlderError(false);
    try {
      const page = await listChatMessages({ room: room.id, before: first.id, limit: PAGE_SIZE });
      if (list.current) keepOffset.current = list.current.scrollHeight - list.current.scrollTop;
      setOlder(current => merge(page.items, current));
      setOlderHasMore(page.hasMore);
    } catch { setOlderError(true); } finally { setLoadingOlder(false); }
  };

  const updateLatest = (change: (items: ChatMessage[]) => ChatMessage[]) =>
    qc.setQueryData<ChatMessagePage>(key, current => current ? { ...current, items: change(current.items) } : current);

  const send = useSendChatMessage();
  const [draft, setDraft] = useState('');
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate({ data: { body, room: room.id } }, { onSuccess: message => {
      setDraft(''); stickToBottom.current = true;
      updateLatest(items => merge(items, [message]));
      void qc.invalidateQueries({ queryKey: key });
    } });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  };

  const remove = useDeleteChatMessage();
  const [confirming, setConfirming] = useState<number | null>(null);
  useEffect(() => { if (confirming === null) return; const t = setTimeout(() => setConfirming(null), 4000); return () => clearTimeout(t); }, [confirming]);
  const deleteMessage = (id: number) => {
    if (confirming !== id) { setConfirming(id); return; }
    setConfirming(null);
    remove.mutate({ id }, { onSuccess: () => {
      setOlder(current => current.filter(m => m.id !== id));
      updateLatest(items => items.filter(m => m.id !== id));
      void qc.invalidateQueries({ queryKey: key });
    } });
  };

  return <section className="ws-panel chat-panel" aria-label={`${room.name} chat`} role="tabpanel">
      <div className="chat-list" ref={list} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions" data-testid="chat-list">
        {latest.isLoading ? <div className="chat-state"><LoaderCircle size={20} className="spin"/> Loading the conversation…</div>
          : latest.isError && !latest.data ? <div className="chat-state" role="alert">{errorMessage(latest.error, 'We couldn’t load the chat.')} <button className="ws-link" onClick={() => void latest.refetch()}>Try again</button></div>
          : messages.length === 0 ? <div className="chat-state chat-empty"><div className="state-icon"><MessagesSquare size={22}/></div><strong>No messages yet.</strong><span>Start the conversation and say hello.</span></div>
          : <>
            {hasMore && <div className="chat-older">
              <button className="button button-outline button-small" onClick={() => void loadOlder()} disabled={loadingOlder} data-testid="button-chat-older">
                {loadingOlder ? <><LoaderCircle size={14} className="spin"/> Loading…</> : 'Load earlier messages'}</button>
              {olderError && <span className="form-error" role="alert">Couldn’t load earlier messages.</span>}
            </div>}
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const newDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
              const grouped = !newDay && previous?.authorName === message.authorName && previous.mine === message.mine
                && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60_000;
              return <div key={message.id}>
                {newDay && <div className="chat-day"><span>{dayLabel(message.createdAt)}</span></div>}
                <article className={`chat-message${message.mine ? ' chat-mine' : ''}${grouped ? ' chat-grouped' : ''}`} data-testid={`chat-message-${message.id}`}>
                  {!message.mine && <div className="chat-avatar" aria-hidden="true">{grouped ? '' : message.authorName.slice(0, 1).toUpperCase()}</div>}
                  <div className="chat-bubble-wrap">
                    {!grouped && <div className="chat-meta"><strong>{message.mine ? 'You' : message.authorName}</strong><time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time></div>}
                    <div className="chat-bubble">{message.body}</div>
                  </div>
                  {message.canDelete && <button className={`chat-delete${confirming === message.id ? ' chat-delete-confirm' : ''}`} onClick={() => deleteMessage(message.id)}
                    aria-label={confirming === message.id ? 'Confirm deleting this message' : 'Delete this message'} data-testid={`button-chat-delete-${message.id}`}>
                    <Trash2 size={13}/>{confirming === message.id && <span>Delete?</span>}</button>}
                </article>
              </div>;
            })}
          </>}
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="chat-input">Message</label>
        <textarea id="chat-input" value={draft} onChange={e => setDraft(e.target.value.slice(0, MAX_LENGTH))} onKeyDown={onKeyDown} rows={2}
          maxLength={MAX_LENGTH} placeholder={`Message ${room.name}… (Enter to send, Shift+Enter for a new line)`} data-testid="input-chat-message"/>
        <div className="chat-composer-side">
          <small aria-live="polite">{draft.length > MAX_LENGTH - 100 ? `${MAX_LENGTH - draft.length} left` : ''}</small>
          <button className="button button-primary chat-send" disabled={!draft.trim() || send.isPending} aria-label="Send message" data-testid="button-chat-send">
            {send.isPending ? <LoaderCircle size={17} className="spin"/> : <ArrowUp size={17}/>}</button>
        </div>
      </form>
      {(send.isError || remove.isError) && <p className="form-error chat-error" role="alert">{errorMessage(send.error ?? remove.error, 'That didn’t go through. Please try again.')}</p>}
    </section>;
}
