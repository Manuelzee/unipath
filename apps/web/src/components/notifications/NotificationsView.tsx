import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { getListMyNotificationsQueryKey, useListMyNotifications, type Notification } from '@workspace/api-client-react';
import { AlarmClock, ArrowRight, BellRing, CalendarClock, CheckCircle2, ListChecks, Megaphone, RotateCw } from 'lucide-react';
import { useUser } from '@/lib/auth';
import { useUnreadAnnouncements } from '@/components/announcements/AnnouncementsView';
import './notifications.css';

/**
 * Reminders for the dates a student recorded (application deadlines, plan
 * tasks). Which ones were already seen is kept per account in this browser,
 * only for the sidebar badge.
 */
const SEEN_EVENT = 'unipath:notifications-seen';
const seenKey = (userId: string) => `unipath:notifications:seen:${userId}`;
function readSeen(userId: string): Set<string> {
  try { return new Set(JSON.parse(window.localStorage.getItem(seenKey(userId)) || '[]') as string[]); } catch { return new Set(); }
}
function markSeen(userId: string, ids: string[]) {
  try {
    const seen = readSeen(userId);
    const fresh = ids.filter(id => !seen.has(id));
    if (!fresh.length) return;
    // Keep the newest few hundred; old reminders drop out of the window anyway.
    window.localStorage.setItem(seenKey(userId), JSON.stringify([...seen, ...fresh].slice(-300)));
    window.dispatchEvent(new Event(SEEN_EVENT));
  } catch { /* storage unavailable: the badge simply stays */ }
}

const QUERY = { queryKey: getListMyNotificationsQueryKey(), staleTime: 60_000, refetchInterval: 300_000, retry: false };

/** How many reminders this student has not opened yet (for the sidebar badge). */
export function useUnseenNotifications(): number {
  const { user, isSignedIn } = useUser();
  const q = useListMyNotifications({ query: { ...QUERY, enabled: !!isSignedIn } });
  const [, rerender] = useState(0);
  useEffect(() => {
    const update = () => rerender(n => n + 1);
    window.addEventListener(SEEN_EVENT, update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener(SEEN_EVENT, update); window.removeEventListener('storage', update); };
  }, []);
  if (!user || !q.data) return 0;
  const seen = readSeen(user.id);
  return q.data.items.filter(item => !seen.has(item.id)).length;
}

function Item({ n, fresh }: { n: Notification; fresh: boolean }) {
  const late = n.daysAway < 0;
  const Icon = n.kind === 'deadline' ? (late ? AlarmClock : CalendarClock) : ListChecks;
  return <Link href={n.href} className={`ntf-item${late ? ' ntf-late' : n.daysAway <= 3 ? ' ntf-soon' : ''}`} data-testid={`notification-${n.id}`}>
    <span className="ntf-icon" aria-hidden="true"><Icon size={18}/></span>
    <span className="ntf-body">
      <strong>{n.title}</strong>
      <small>{n.detail}</small>
    </span>
    <span className="ntf-date">{new Date(`${n.date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}{fresh && <i>New</i>}</span>
  </Link>;
}

export function NotificationsView() {
  const { user } = useUser();
  const q = useListMyNotifications({ query: QUERY });
  const announcements = useUnreadAnnouncements();
  // Remember what was new when the page opened, then mark everything as seen.
  const [freshIds, setFreshIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!user || !q.data || freshIds) return;
    const seen = readSeen(user.id);
    setFreshIds(new Set(q.data.items.filter(i => !seen.has(i.id)).map(i => i.id)));
    markSeen(user.id, q.data.items.map(i => i.id));
  }, [user, q.data, freshIds]);

  return <div className="page page-enter">
    <div className="page-heading"><div><div className="eyebrow">NOTIFICATIONS</div><h1>What needs your attention.</h1>
      <p>Reminders for the application deadlines and plan tasks you recorded: from 30 days before a deadline (14 for tasks) until a week after it passes.</p></div></div>

    {announcements > 0 && <Link href="/announcements" className="ntf-item ntf-announce" data-testid="notification-announcements">
      <span className="ntf-icon" aria-hidden="true"><Megaphone size={18}/></span>
      <span className="ntf-body"><strong>{announcements === 1 ? '1 new announcement' : `${announcements} new announcements`}</strong><small>From the UniPath team.</small></span>
      <span className="ntf-date"><ArrowRight size={16}/></span>
    </Link>}

    {q.isLoading ? <div className="loading-stack" aria-label="Loading"><div className="skeleton skeleton-card"/><div className="skeleton skeleton-card"/></div>
      : q.isError || !q.data ? <div className="state-card" role="alert"><div className="state-icon warning"><RotateCw size={21}/></div><h3>Reminders did not load</h3><p>This is a loading problem, not an empty list.</p><button className="button button-primary button-small" onClick={() => void q.refetch()}>Try again</button></div>
      : q.data.items.length
        ? <div className="ntf-list" data-testid="list-notifications">{q.data.items.map(n => <Item key={n.id} n={n} fresh={!!freshIds?.has(n.id)}/>)}</div>
        : <div className="state-card" data-testid="empty-notifications"><div className="state-icon"><CheckCircle2 size={21}/></div><h3>Nothing due soon</h3>
            <p>Add a deadline to an application or a date to a task, and reminders will appear here.</p>
            <div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap'}}><Link href="/applications" className="button button-primary button-small">Track an application</Link><Link href="/dashboard" className="button button-outline button-small">Plan a task</Link></div></div>}
    <p className="ntf-foot"><BellRing size={13}/> Reminders appear here and as a badge in the menu. Email reminders are not available yet.</p>
  </div>;
}
