import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  getGetAdminAccessQueryKey, getGetAdminBillingQueryKey, getListAdminCustomersQueryKey,
  useGetAdminAccess, useGetAdminBilling, useListAdminCustomers,
} from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, Lock, Search, ShieldCheck } from 'lucide-react';
import { AccessDenied } from '@/components/admin/AdminViews';
import { PACKAGES, PLANS, SUPPORT } from '@/components/plans/catalog';
import { CurrencySelect } from '@/components/profile/PreferenceFields';
import { RateNote, fmtMoney, useUsdRate } from '@/components/money/currency';
import { Failed, Loading, NA, Pill, StatusRows, UnavailableTable } from './BillingViews';

export function AdminBillingView() {
  const access = useGetAdminAccess({ query: { queryKey: getGetAdminAccessQueryKey() } });
  if (access.isLoading) return <div className="page"><Loading/></div>;
  if (access.isError) return <div className="page"><Failed what="admin access" onRetry={() => void access.refetch()}/></div>;
  if (!access.data?.isAdmin) return <AccessDenied/>;
  return <Inner/>;
}

const TABS = [['customers', 'Customers'], ['plans', 'Plans'], ['revenue', 'Revenue'], ['settings', 'Payment settings']] as const;
type Tab = typeof TABS[number][0];

function Inner() {
  const q = useGetAdminBilling({ query: { queryKey: getGetAdminBillingQueryKey() } });
  const [tab, setTab] = useState<Tab>('customers');
  return <div className="page page-enter">
    <Link href="/admin" className="back-link" data-testid="link-back-admin"><ArrowLeft size={16}/> Back to admin</Link>
    <div className="page-heading"><div><div className="eyebrow">ADMIN · REVENUE &amp; TRANSACTIONS</div><h1>Billing desk.</h1><p>No payment provider is connected. Every money figure here is unavailable rather than zero.</p></div></div>
    {q.isLoading ? <Loading/> : q.isError || !q.data ? <Failed what="billing configuration" onRetry={() => void q.refetch()}/> : <div className="tu-panel" style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}><ShieldCheck size={16}/><span style={{fontSize:13,color:'#324b60',flex:1}} data-testid="text-admin-billing-message">{q.data.message}</span><Pill ok={q.data.livePaymentsEnabled}>{q.data.livePaymentsEnabled ? 'Live' : `Live payments · ${NA}`}</Pill></div>}
    <div className="seg seg-wrap" role="tablist" style={{marginBottom:14}}>{TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)} data-testid={`tab-billing-${id}`}>{label}</button>)}</div>
    {tab === 'customers' && <Customers/>}
    {tab === 'plans' && <Plans/>}
    {tab === 'revenue' && <Revenue/>}
    {tab === 'settings' && <Settings/>}
  </div>;
}

function Customers() {
  const [search, setSearch] = useState(''); const [term, setTerm] = useState(''); const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  const params = { search: term || undefined, page };
  const q = useListAdminCustomers(params, { query: { queryKey: getListAdminCustomersQueryKey(params) } });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / Math.max(1, q.data.pageSize))) : 1;
  return <section className="bill-card"><span className="eyebrow">CUSTOMER MANAGEMENT</span><h2>Student accounts with saved profiles</h2>
    <p>Only accounts that saved a profile appear. This is not every registration and none are paying customers. Private budgets are not shown.</p>
    <label className="adm-search" style={{display:'flex',gap:8,alignItems:'center',border:'1px solid #dbe4e9',borderRadius:10,padding:'8px 10px'}}><Search size={15}/><input style={{border:0,outline:0,flex:1,background:'none',font:'inherit'}} value={search} maxLength={100} onChange={e => setSearch(e.target.value)} placeholder="Search account reference, country or degree" aria-label="Search customers" data-testid="input-customer-search"/></label>
    {q.isLoading ? <Loading/> : q.isError || !q.data ? <Failed what="customers" onRetry={() => void q.refetch()}/> : <>
      {q.data.note && <p className="fx-note">{q.data.note}</p>}
      <div className="cmp-panel" style={{padding:0,marginTop:10}}><table className="cmp-table" data-testid="table-customers"><thead><tr><th>Account reference</th><th>Study country</th><th>Degree level</th><th>Access plan</th><th>Profile updated</th><th>Actions</th></tr></thead>
        <tbody>{q.data.items.length ? q.data.items.map(c => <tr key={c.accountReference} data-testid={`row-customer-${c.accountReference}`}><td><code>{c.accountReference}</code></td><td>{c.studyCountry || <span className="cmp-unknown">Not given</span>}</td><td>{c.degreeLevel || <span className="cmp-unknown">Not given</span>}</td><td>{c.accessPlan}</td><td>{new Date(c.updatedAt).toLocaleDateString()}</td><td><button className="button button-outline button-small" disabled title={NA}><Lock size={12}/> Change plan</button></td></tr>)
          : <tr><td colSpan={6} className="cmp-unknown" style={{padding:16}}>{term ? 'No saved profiles match this search.' : 'No saved student profiles yet.'}</td></tr>}</tbody></table></div>
      <div className="pagination-bar"><button className="button button-outline button-small" disabled={page <= 1 || q.isFetching} onClick={() => setPage(p => p - 1)} data-testid="button-customers-prev"><ArrowLeft size={14}/> Previous</button><span>Page {q.data.page} of {pages} · {q.data.total.toLocaleString()} profiles</span><button className="button button-outline button-small" disabled={page >= pages || q.isFetching} onClick={() => setPage(p => p + 1)} data-testid="button-customers-next">Next <ArrowRight size={14}/></button></div>
    </>}
  </section>;
}

function Plans() {
  return <section className="bill-card"><span className="eyebrow">PLAN MANAGEMENT</span><h2>Catalog (USD, display only)</h2>
    <p>These are the published catalog prices. Activating, editing or pricing plans requires a payment provider and is {NA.toLowerCase()}.</p>
    <div className="cmp-panel" style={{padding:0}}><table className="cmp-table" data-testid="table-plans"><thead><tr><th>Plan</th><th>Price (USD)</th><th>Billing</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {PLANS.map(p => <tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.price}</td><td>{p.period}</td><td>{p.id === 'free' ? <Pill ok>Active</Pill> : <Pill ok={false}>{NA}</Pill>}</td><td><button className="button button-outline button-small" disabled data-testid={`button-activate-${p.id}`}><Lock size={12}/> {p.id === 'free' ? 'Edit' : 'Activate'}</button></td></tr>)}
      {PACKAGES.map(p => <tr key={p.id}><td><strong>{SUPPORT.name}: {p.name}</strong></td><td>{p.price}</td><td>one-time</td><td><Pill ok={false}>{NA}</Pill></td><td><button className="button button-outline button-small" disabled data-testid={`button-activate-${p.id}`}><Lock size={12}/> Activate</button></td></tr>)}
    </tbody></table></div>
  </section>;
}

function Revenue() {
  const kpis = ['Gross revenue', 'Active subscriptions', 'Refunds', 'Failed payments'];
  return <section className="bill-card"><span className="eyebrow">REVENUE REPORTING</span><h2>Reports</h2>
    <p>No transaction source exists, so values are shown as unavailable dashes, not zeros. No charts are drawn.</p>
    <div className="tu-rows" style={{gridTemplateColumns:'repeat(4,minmax(0,1fr))'}}>{kpis.map(k => <div className="tu-cell tu-missing" key={k} data-testid={`stat-${k.toLowerCase().replaceAll(' ', '-')}`}><span>{k}</span><strong>—</strong><small>{NA}</small></div>)}</div>
    <h3 style={{fontSize:15,marginTop:18}}>Transactions</h3>
    <UnavailableTable testId="table-transactions" columns={['Date', 'Account', 'Item', 'Amount', 'Currency', 'Status', 'Refund']} notice=" Purchases, refunds and failed payments require a connected provider with verified webhooks."/>
    <button className="button button-outline button-small" disabled style={{marginTop:10}} data-testid="button-export-disabled"><Lock size={12}/> Export CSV · {NA}</button>
  </section>;
}

function Settings() {
  const q = useGetAdminBilling({ query: { queryKey: getGetAdminBillingQueryKey() } });
  const [cur, setCur] = useState('EUR'); const { rate } = useUsdRate(cur);
  return <div className="bill-grid">
    <section className="bill-card"><span className="eyebrow">SERVER STATUS</span><h2>Provider configuration</h2>{q.data ? <StatusRows b={q.data}/> : <Loading/>}</section>
    <section className="bill-card"><span className="eyebrow">LOCAL PREVIEW ONLY</span><h2>Display currency preview</h2><p>Preview how catalog prices convert. This does not change any server setting.</p>
      <CurrencySelect value={cur} onChange={setCur} testId="select-admin-preview-currency"/><RateNote currency={cur}/>
      {PLANS.filter(p => p.id !== 'free').map(p => { const n = Number(p.price.replace(/[^\d.]/g, '')); return <div className="bill-row" key={p.id}><span>{p.name} {p.price}</span><strong>{rate || cur === 'USD' ? fmtMoney(n * (cur === 'USD' ? 1 : rate as number), cur) : '—'}</strong></div>; })}
    </section>
    <section className="bill-card bill-wide"><span className="eyebrow">PAYMENT METHODS &amp; FEES</span><h2>Controls</h2>
      {['Card payments', 'Local payment methods', 'Cryptocurrency (BTC, ETH, USDC, USDT examples; not verified)', 'Processing fees and tax', 'Enable live payments'].map(x => <div className="bill-row" key={x}><span>{x}</span><button className="button button-outline button-small" disabled><Lock size={12}/> {NA}</button></div>)}
      <ol className="bill-steps"><li>Connect a reputable provider and keep keys in server secrets.</li><li>Add hosted checkout, verified webhooks and duplicate protection on the server.</li><li>Configure tax, refunds and disclosures, test in sandbox, then approve going live.</li></ol>
    </section>
  </div>;
}
