import type { ReactNode } from 'react';
import { ApiError, type ApplicationStatus } from '@workspace/api-client-react';

export const cn = (...v: Array<string | false | null | undefined>) => v.filter(Boolean).join(' ');

export function PageHeading({ kicker, title, body, action }: { kicker: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1>{body && <p>{body}</p>}</div>{action}</div>;
}

/**
 * Only render plain web links. Directory records often store bare domains
 * ("www.school.edu"), which are treated as https. Other schemes are refused.
 */
export function safeHref(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export const MAX_COMPARE = 4;
/** Repeated `id` parameters keep any character in an institution id safe. */
export const compareHref = (ids: string[]) => `/compare?${ids.map(id => `id=${encodeURIComponent(id)}`).join('&')}`;

export const STATUS_ORDER: ApplicationStatus[] = [
  'interested', 'researching', 'preparing_documents', 'ready_to_apply', 'submitted', 'under_review', 'accepted', 'rejected', 'waitlisted',
];
export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  interested: 'Interested', researching: 'Researching', preparing_documents: 'Preparing documents',
  ready_to_apply: 'Ready to apply', submitted: 'Submitted', under_review: 'Under review',
  accepted: 'Accepted', rejected: 'Rejected', waitlisted: 'Waitlisted',
};
export const STATUS_HINT: Record<ApplicationStatus, string> = {
  interested: 'Considering this school',
  researching: 'Reading requirements and program details',
  preparing_documents: 'Gathering transcripts, essays and test results',
  ready_to_apply: 'Ready to submit on the official site',
  submitted: 'You submitted directly to the institution',
  under_review: 'The institution is reviewing it',
  accepted: 'You received an offer',
  rejected: 'Not offered a place this time',
  waitlisted: 'On the institution’s waitlist',
};
export const FINAL_STATUSES: ApplicationStatus[] = ['accepted', 'rejected', 'waitlisted'];

/** Blueprint lifecycle: Discover → Save → Plan → Prepare → Apply → Track. */
export const LIFECYCLE = ['Discover', 'Save', 'Plan', 'Prepare', 'Apply', 'Track'] as const;
export function lifecycleIndex(status: ApplicationStatus) {
  switch (status) {
    case 'interested': return 1;
    case 'researching': return 2;
    case 'preparing_documents': case 'ready_to_apply': return 3;
    case 'submitted': case 'under_review': return 4;
    default: return 5;
  }
}

export function StatusPill({ status }: { status: ApplicationStatus }) {
  return <span className={`app-status app-status-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export const CLASSIFICATION_LABEL: Record<string, string> = {
  strong_match: 'Strong Match',
  potential_match: 'Potential Match',
  requirements_not_met: 'Requirements Not Met',
  insufficient_information: 'Insufficient Information',
};
export function ClassificationBadge({ value }: { value: string }) {
  return <span className={`cls-badge cls-${value}`} data-testid={`badge-classification-${value}`}>{CLASSIFICATION_LABEL[value] ?? value}</span>;
}

const DAY = 86_400_000;
/** Whole days from today (local) to an ISO date. Negative means past. */
export function daysUntil(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / DAY);
}
/** Format a calendar date (YYYY-MM-DD) without shifting it across time zones. */
export function formatDay(isoDate: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}
export function dueLabel(isoDate: string) {
  const n = daysUntil(isoDate);
  if (n < 0) return `${Math.abs(n)} day${n === -1 ? '' : 's'} overdue`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${n} days`;
}
export const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** A readable message from an API failure, preferring the server's own wording. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (error instanceof ApiError) {
    const data = error.data as { error?: unknown } | null | undefined;
    if (data && typeof data.error === 'string' && data.error.trim()) return data.error;
  }
  return fallback;
}
export function errorCode(error: unknown): string | null {
  if (error instanceof ApiError) {
    const data = error.data as { code?: unknown } | null | undefined;
    if (data && typeof data.code === 'string') return data.code;
  }
  return null;
}
