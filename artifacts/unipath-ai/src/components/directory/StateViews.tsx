import { ArrowRight, Compass, Globe2 } from 'lucide-react';

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return <div className="loading-stack" aria-label={label} aria-busy="true"><div className="skeleton skeleton-line"/><div className="skeleton skeleton-card"/><div className="skeleton skeleton-card"/></div>;
}
export function ErrorBlock({ retry, title = 'We couldn’t load this just now', body = 'The request failed. Please try again; this is not a confirmed empty result.' }: { retry: () => void; title?: string; body?: string }) {
  return <div className="state-card" role="alert"><div className="state-icon warning"><Globe2 size={21}/></div><h3>{title}</h3><p>{body}</p><button className="button button-primary button-small" onClick={retry} data-testid="button-retry">Try again</button></div>;
}
export function EmptyBlock({ title, body, action, onAction, testId }: { title: string; body: string; action?: string; onAction?: () => void; testId?: string }) {
  return <div className="state-card" data-testid={testId}><div className="state-icon"><Compass size={22}/></div><h3>{title}</h3><p>{body}</p>{action && onAction && <button className="button button-primary button-small" onClick={onAction}>{action} <ArrowRight size={15}/></button>}</div>;
}
export function Unknown({ children }: { children: string }) {
  return <span className="unknown-value">{children}</span>;
}
