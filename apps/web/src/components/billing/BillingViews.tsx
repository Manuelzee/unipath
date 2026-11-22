import { Link } from 'wouter';
import { getGetMyBillingQueryKey, useGetMyBilling } from '@workspace/api-client-react';
import type { BillingAvailability } from '@workspace/api-client-react';
import { AlertTriangle, ArrowRight, Lock, RefreshCw } from 'lucide-react';
import '@/components/money/money.css';

export const NA = 'Not available yet';
export function Loading() { return <div className="loading-stack" aria-label="Loading"><div className="skeleton skeleton-line"/><div className="skeleton skeleton-card"/></div>; }
export function Failed({ onRetry, what }: { onRetry: () => void; what: string }) {
  return <div className="state-card" role="alert"><div className="state-icon warning"><AlertTriangle size={21}/></div><h3>Couldn’t load {what}</h3><p>This is a loading problem, not a statement about your account.</p><button className="button button-primary button-small" onClick={onRetry} data-testid="button-retry-billing"><RefreshCw size={14}/> Try again</button></div>;
}
export const Pill = ({ ok, children }: { ok: boolean; children: string }) => <span className={'bill-pill' + (ok ? ' ok' : '')}>{children}</span>;

export function StatusRows({ b }: { b: BillingAvailability }) {
  return <div className="bill-status" data-testid="list-billing-status">
    <div className="bill-row"><span>Payment provider</span><Pill ok={b.providerConfigured}>{b.providerConfigured ? `${b.provider} configured` : 'Not connected'}</Pill></div>
    <div className="bill-row"><span>Paid checkout</span><Pill ok={b.livePaymentsEnabled}>{b.livePaymentsEnabled ? 'Enabled' : NA}</Pill></div>
    <div className="bill-row"><span>Cryptocurrency</span><Pill ok={b.cryptoEnabled}>{b.cryptoEnabled ? 'Enabled' : NA}</Pill></div>
    <div className="bill-row"><span>Payment history</span><Pill ok={b.historyAvailable}>{b.historyAvailable ? 'Available' : NA}</Pill></div>
    <div className="bill-row"><span>Pricing currency</span><strong>{b.baseCurrency}</strong></div>
    <div className="bill-row"><span>Display currencies</span><strong style={{textAlign:'right'}}>{b.displayCurrencies.length ? `${b.displayCurrencies.length} for estimates only` : 'None'}</strong></div>
  </div>;
}

/** Table with real column layout and an explicit unavailable-source row, never placeholder records. */
export function UnavailableTable({ columns, notice, testId }: { columns: string[]; notice: string; testId: string }) {
  return <div className="cmp-panel" style={{marginTop:10,padding:0}} data-testid={testId}><table className="cmp-table"><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
    <tbody><tr><td colSpan={columns.length} style={{padding:18}}><div className="bill-unavail" style={{border:0,padding:0,background:'none'}}><strong>{NA}</strong>{notice}</div></td></tr></tbody></table></div>;
}

const CRYPTO = ['BTC', 'ETH', 'USDC', 'USDT'];

export function BillingView() {
  const q = useGetMyBilling({ query: { queryKey: getGetMyBillingQueryKey() } });
  return <div className="page page-enter">
    <div className="page-heading"><div><div className="eyebrow">ACCOUNT</div><h1>Billing &amp; Payments</h1><p>Your plan, payments and invoices, once billing opens. Nothing can be charged today.</p></div><Link href="/plans" className="button button-outline button-small" data-testid="link-billing-plans">See plans <ArrowRight size={14}/></Link></div>
    {q.isLoading ? <Loading/> : q.isError || !q.data ? <Failed what="billing status" onRetry={() => void q.refetch()}/> : <div className="bill-grid">
      <section className="bill-card bill-wide"><span className="eyebrow">CURRENT ACCESS</span><h2 data-testid="text-current-plan">Free · $0</h2><p>Every tool that works today is free. Paid plans cannot be activated, so nothing is charging you.</p><p data-testid="text-billing-message">{q.data.message}</p></section>
      <section className="bill-card"><span className="eyebrow">STATUS</span><h2>Billing setup</h2><StatusRows b={q.data}/></section>
      <section className="bill-card"><span className="eyebrow">MANAGE</span><h2>Subscription and refunds</h2>
        {['Paid checkout', 'Receipts', 'Refunds', 'Subscription management and cancellation'].map(x => <div className="bill-row" key={x}><span>{x}</span><Pill ok={false}>{NA}</Pill></div>)}
        <button className="button button-outline button-small" disabled style={{marginTop:12}} data-testid="button-manage-disabled"><Lock size={13}/> Manage subscription · {NA}</button>
      </section>
      <section className="bill-card bill-wide"><span className="eyebrow">PAYMENT HISTORY</span><h2>Payments and invoices</h2>
        <UnavailableTable testId="table-payment-history" columns={['Date', 'Description', 'Amount', 'Currency', 'Status', 'Receipt']} notice=" No payment provider is connected, so there is no payment source to read from. This is not an empty history; payment history does not exist yet."/>
      </section>
      <section className="bill-card bill-wide" data-testid="section-crypto"><span className="eyebrow">FUTURE · CRYPTOCURRENCY</span><h2>Pay with crypto <Pill ok={false}>{NA}</Pill></h2>
        <p>No compliant crypto payment processor is connected. The tokens below are examples of what some processors offer; support, networks and availability in your country are not verified. No wallet addresses are shown and no transfers can be requested.</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{CRYPTO.map(c => <button key={c} className="button button-outline button-small" disabled data-testid={`button-crypto-${c.toLowerCase()}`}><Lock size={12}/> {c} · {NA}</button>)}</div>
      </section>
    </div>}
  </div>;
}
