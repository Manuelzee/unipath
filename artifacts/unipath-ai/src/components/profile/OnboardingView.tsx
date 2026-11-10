import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import {
  getGetBudgetSettingsQueryKey, getGetStudentProfileQueryKey, getGetStudentRecommendationsQueryKey,
  useGetBudgetSettings, useSaveBudgetSettings,
} from '@workspace/api-client-react';
import type { BudgetPreferences } from '@workspace/api-client-react';
import { AlertTriangle, ArrowRight, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { BudgetFields, LIVING_KEYS, invalidLivingExpenses, type BudgetForm } from './PreferenceFields';
import '@/components/money/money.css';

const DEFAULTS: BudgetForm = { budgetChoice: undefined, budgetCurrency: 'USD', budgetScope: 'tuition', customBudget: null, livingExpenses: {} };

function cleanLiving(le: BudgetForm['livingExpenses']) {
  const out: NonNullable<BudgetForm['livingExpenses']> = {};
  for (const k of LIVING_KEYS) { const v = le?.[k]; out[k] = v != null && Number.isFinite(v) && v >= 0 && v <= 1e9 ? v : null; }
  return out;
}

export function OnboardingView() {
  const q = useGetBudgetSettings({ query: { queryKey: getGetBudgetSettingsQueryKey() } });
  const save = useSaveBudgetSettings(); const qc = useQueryClient(); const [, setLocation] = useLocation();
  const [form, setForm] = useState<BudgetForm>(DEFAULTS);
  const init = useRef(false);
  useEffect(() => {
    if (init.current || !q.data) return; init.current = true;
    const b = q.data.budget;
    setForm({ budgetChoice: q.data.hasProfile ? b.budgetChoice : undefined, budgetCurrency: b.budgetCurrency || 'USD', budgetScope: b.budgetScope, customBudget: b.customBudget, livingExpenses: b.livingExpenses ?? {} });
  }, [q.data]);

  const customInvalid = form.budgetChoice === 'custom' && !(form.customBudget != null && form.customBudget >= 1 && form.customBudget <= 1e9);
  const livingInvalid = invalidLivingExpenses(form.livingExpenses);
  const persist = (data: BudgetPreferences) => save.mutate({ data }, { onSuccess: () => {
    void qc.invalidateQueries({ queryKey: getGetBudgetSettingsQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetStudentProfileQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetStudentRecommendationsQueryKey() });
    setLocation('/discover');
  } });
  const base = { budgetCurrency: form.budgetCurrency || 'USD', budgetScope: form.budgetScope ?? 'tuition', livingExpenses: cleanLiving(form.livingExpenses) } as const;
  const submit = () => {
    if (customInvalid || livingInvalid) return;
    const choice = form.budgetChoice ?? 'none';
    persist({ ...base, budgetChoice: choice, customBudget: choice === 'custom' ? Math.floor(form.customBudget as number) : null });
  };
  const skip = () => { if (!livingInvalid && !save.isPending) persist({ ...base, budgetChoice: 'none', customBudget: null }); };

  return <div className="page page-enter">
    <div className="page-heading"><div><div className="eyebrow">WELCOME · STEP 1 OF 1</div><h1>What can you spend each year?</h1><p>A rough number is plenty. You can skip this and change it any time in your profile.</p></div></div>
    {q.isLoading ? <div className="loading-stack" aria-label="Loading"><div className="skeleton skeleton-line"/><div className="skeleton skeleton-card"/></div>
      : q.isError ? <div className="state-card" role="alert"><div className="state-icon warning"><AlertTriangle size={21}/></div><h3>We couldn’t load your budget settings</h3><p>Nothing was changed. Try again, or skip ahead and set this later.</p><div style={{display:'flex',gap:8,justifyContent:'center'}}><button className="button button-primary button-small" onClick={() => void q.refetch()} data-testid="button-retry-budget"><RefreshCw size={14}/> Try again</button><Link href="/discover" className="button button-outline button-small">Explore schools</Link></div></div>
      : <div className="profile-layout"><form className="profile-form content-panel" onSubmit={e => { e.preventDefault(); submit(); }}>
        <BudgetFields form={form} setForm={setForm} onSkip={skip}/>
        <div className="form-footer"><span>Private to you. Never shared with schools. No payment details are collected.</span>
          <button className="button button-primary" disabled={save.isPending || customInvalid || livingInvalid} data-testid="button-save-budget">{save.isPending ? <><LoaderCircle size={16} className="spin"/> Saving…</> : <>Save &amp; continue <ArrowRight size={16}/></>}</button></div>
        {customInvalid && <p className="form-error" role="alert">Enter a custom amount from 1 to 1,000,000,000, or choose another option.</p>}
        {save.isError && <p className="form-error" role="alert" data-testid="text-budget-error">We couldn’t save your budget. Nothing was changed; please try again.</p>}
      </form>
      <aside className="profile-side"><div className="profile-note"><div className="note-icon"><ShieldCheck size={19}/></div><h3>Honest about cost data</h3><p>School tuition figures are not available in UniPath yet. Your budget helps you plan and filter once source figures exist; it never hides schools without your say.</p></div></aside></div>}
  </div>;
}
