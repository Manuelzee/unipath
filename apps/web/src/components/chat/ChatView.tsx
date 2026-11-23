import { type FormEvent, type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListChatMessagesQueryKey, listChatMessages, useDeleteChatMessage, useListChatMessages, useSendChatMessage,
} from '@workspace/api-client-react';
import type { ChatMessage, ChatMessagePage } from '@workspace/api-client-react';
import { ArrowUp, LoaderCircle, MessagesSquare, ShieldCheck, Trash2 } from 'lucide-react';
import { PageHeading, errorMessage } from '@/components/workspace/shared';

const PAGE = { limit: 50 };
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
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** The community chat room every signed-in student shares. */
export function ChatView() {
  const qc = useQueryClient();
  const key = getListChatMessagesQueryKey(PAGE);
  const latest = useListChatMessages(PAGE, { query: { queryKey: key, refetchInterval: POLL_MS } });
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
      const page = await listChatMessages({ before: first.id, limit: PAGE.limit });
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
    send.mutate({ data: { body } }, { onSuccess: message => {
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

  return <div className="page page-enter chat-page">
    <PageHeading kicker="COMMUNITY" title="Student lounge." body="Swap tips, ask questions and meet other students planning their next chapter."/>
    <section className="ws-panel chat-panel" aria-label="Community chat">
      <div className="chat-list" ref={list} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions" data-testid="chat-list">
        {latest.isLoading ? <div className="chat-state"><LoaderCircle size={20} className="spin"/> Loading the conversation…</div>
          : latest.isError && !latest.data ? <div className="chat-state" role="alert">We couldn’t load the chat. <button className="ws-link" onClick={() => void latest.refetch()}>Try again</button></div>
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
          maxLength={MAX_LENGTH} placeholder="Write a message… (Enter to send, Shift+Enter for a new line)" data-testid="input-chat-message"/>
        <div className="chat-composer-side">
          <small aria-live="polite">{draft.length > MAX_LENGTH - 100 ? `${MAX_LENGTH - draft.length} left` : ''}</small>
          <button className="button button-primary chat-send" disabled={!draft.trim() || send.isPending} aria-label="Send message" data-testid="button-chat-send">
            {send.isPending ? <LoaderCircle size={17} className="spin"/> : <ArrowUp size={17}/>}</button>
        </div>
      </form>
      {(send.isError || remove.isError) && <p className="form-error chat-error" role="alert">{errorMessage(send.error ?? remove.error, 'That didn’t go through. Please try again.')}</p>}
    </section>
    <div className="ws-notice"><ShieldCheck size={16}/><span>Every signed-in student can read this room. Others see only your first name and last initial. Be kind, and never share passwords, codes or contact details here.</span></div>
  </div>;
}
