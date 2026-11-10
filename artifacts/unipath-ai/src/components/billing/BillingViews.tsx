import { Link } from 'wouter';
import {
  getGetAdminAccessQueryKey, getGetAdminBillingQueryKey, getGetMyBillingQueryKey,
  useGetAdminAccess, useGetAdminBilling, useGetMyBilling,
} from '@workspace/api-client-react';
import type { BillingAvailability } from '@workspace/api-client-react';
import { AlertTriangle, ArrowLeft, ArrowRight, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import { AccessDenied } from '@/components/admin/AdminViews';
import '@/components/money/money.css';

function Loading() { return <div className="loading-stack" aria-label="Loading"><div className="skeleton skeleton-line"/><div className="skeleton skeleton-card"/></div>; }
function Failed({ onRetry, what }: { onRetry: () => void; what: string }) {
  return <div className="state-card" role="alert"><div className="state-icon warning"><AlertTriangle size={21}/></div><h3>Couldn’t load {what}</h3><p>This is a loading problem, not a statement about your account.</p><button className="button button-primary button-small" onClick={onRetry} data-testid="button-retry-billing"><RefreshCw size={14}/> Try again</button></div>;
}
const Pill = ({ ok, children }: { ok: boolean; children: string }) => <span className={'bill-pill' + (ok ? ' ok' : '')}>{children}</span>;

function StatusRows({ b }: { b: BillingAvailability }) {
  return <div className="bill-status" data-testid="list-billing-status">
    <div className="bill-row"><span>Payment provider</span><Pill ok={b.providerConfigured}>{b.providerConfigured ? `${b.provider} configured` : 'Not connected'}</Pill></div>
    <div className="bill-row"><span>Live payments</span><Pill ok={b.livePaymentsEnabled}>{b.livePaymentsEnabled ? 'Enabled' : 'Unavailable'}</Pill></div>
    <div className="bill-row"><span>Cryptocurrency</span><Pill ok={b.cryptoEnabled}>{b.cryptoEnabled ? 'Enabled' : 'Unavailable'}</Pill></div>
    <div className="bill-row"><span>Payment history</span><Pill ok={b.historyAvailable}>{b.historyAvailable ? 'Available' : 'Unavailable'}</Pill></div>
    <div className="bill-row"><span>Pricing currency</span><strong>{b.baseCurrency}</strong></div>
    <div className="bill-row"><span>Display-only currencies</span><strong style={{textAlign:'right'}}>{b.displayCurrencies.join(', ') || 'None'}</strong></div>
  </div>;
}

export function BillingView() {
  const q = useGetMyBilling({ query: { queryKey: getGetMyBillingQueryKey() } });
  return <div className="page page-enter">
    <div className="page-heading"><div><div className="eyebrow">ACCOUNT</div><h1>Billing &amp; Payments</h1><p>Where your plan, payments, and invoices will live once billing opens.</p></div><Link href="/plans" className="button button-outline button-small" data-testid="link-billing-plans">See plans <ArrowRight size={14}/></Link></div>
    {q.isLoading ? <Loading/> : q.isError || !q.data ? <Failed what="billing status" onRetry={() => void q.refetch()}/> : <div className="bill-grid">
      <section className="bill-card bill-wide"><span className="eyebrow">CURRENT PLAN</span><h2 data-testid="text-current-plan">Free</h2><p>Every tool that works today is free. No subscription can be started, so nothing is charging you.</p><p data-testid="text-billing-message">{q.data.message}</p></section>
      <section className="bill-card"><span className="eyebrow">STATUS</span><h2>Billing setup</h2><StatusRows b={q.data}/></section>
      <section className="bill-card"><span className="eyebrow">RECORDS</span><h2>History, invoices, receipts</h2>
        <div className="bill-unavail" data-testid="text-history-unavailable"><strong>Payment history is unavailable.</strong>No payment provider is connected, so there are no records to show. This is not an empty history; history does not exist yet.</div>
        <div className="bill-unavail" style={{marginTop:10}} data-testid="text-cancel-unavailable"><strong>Subscription management and cancellation are unavailable.</strong>There is nothing to cancel because no subscription can be started.</div>
        <button className="button button-outline button-small" disabled style={{marginTop:12}} data-testid="button-manage-disabled"><Lock size={13}/> Manage subscription unavailable</button>
      </section>
    </div>}
  </div>;
}

export function AdminBillingView() {
  const access = useGetAdminAccess({ query: { queryKey: getGetAdminAccessQueryKey() } });
  if (access.isLoading) return <div className="page"><Loading/></div>;
  if (access.isError) return <div className="page"><Failed what="admin access" onRetry={() => void access.refetch()}/></div>;
  if (!access.data?.isAdmin) return <AccessDenied/>;
  return <AdminBillingInner/>;
}

function AdminBillingInner() {
  const q = useGetAdminBilling({ query: { queryKey: getGetAdminBillingQueryKey() } });
  return <div className="page page-enter">
    <Link href="/admin" className="back-link" data-testid="link-back-admin"><ArrowLeft size={16}/> Back to admin</Link>
    <div className="page-heading"><div><div className="eyebrow">ADMIN · REVENUE &amp; TRANSACTIONS</div><h1>Payments setup status.</h1><p>Read-only. No provider is simulated, and no revenue figures exist to report.</p></div></div>
    {q.isLoading ? <Loading/> : q.isError || !q.data ? <Failed what="billing configuration" onRetry={() => void q.refetch()}/> : <div className="bill-grid">
      <section className="bill-card"><span className="eyebrow">CONFIGURATION</span><h2>Provider</h2><StatusRows b={q.data}/><p style={{marginTop:10}} data-testid="text-admin-billing-message">{q.data.message}</p></section>
      <section className="bill-card"><span className="eyebrow">TRANSACTIONS</span><h2>Revenue, refunds, exports</h2>
        <div className="bill-unavail" data-testid="text-transactions-unavailable"><strong>No transaction data source.</strong>Purchases, subscriptions, refunds, revenue reports and exports require a connected provider. Nothing is shown rather than zeros, because zeros would imply payments were tracked.</div>
        <div className="bill-unavail" style={{marginTop:10}}><strong>Cryptocurrency checkout is not available.</strong>No compliant crypto processor is connected. There is no Pay with Crypto option anywhere in the app.</div>
      </section>
      <section className="bill-card bill-wide"><span className="eyebrow">WHAT SETUP NEEDS</span><h2>Before live payments can open</h2>
        <ol className="bill-steps">
          <li>Connect a reputable payment provider and store its keys in server secrets, never in the browser.</li>
          <li>Build hosted checkout, verified webhooks, duplicate-payment protection, and receipts on the server.</li>
          <li>Configure tax, refund and consumer disclosures, and test in sandbox mode.</li>
          <li>Approve going live explicitly. Live payments stay disabled until then.</li>
        </ol>
        <p style={{marginTop:10}}><ShieldCheck size={13} style={{verticalAlign:'-2px'}}/> These settings cannot be changed from this screen; changing them here would not make a provider work.</p>
      </section>
    </div>}
  </div>;
}
