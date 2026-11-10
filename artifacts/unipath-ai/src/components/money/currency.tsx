import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/react';
import { getGetBudgetSettingsQueryKey, getGetExchangeRateQueryKey, useGetBudgetSettings, useGetExchangeRate } from '@workspace/api-client-react';
import type { ExchangeRate } from '@workspace/api-client-react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import './money.css';

export const fmtMoney = (n: number, cur: string) => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(n); }
  catch { return `${n.toLocaleString()} ${cur}`; }
};
export const fmtUsd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

/** Reference rate for USD -> currency. Returns a usable rate only when status is identity or available. */
export function useUsdRate(currency: string) {
  const params = { currency };
  const q = useGetExchangeRate(params, { query: { queryKey: getGetExchangeRateQueryKey(params), staleTime: 10 * 60_000, retry: 1 } });
  const usable = !!q.data && (q.data.status === 'identity' || q.data.status === 'available') && q.data.rate != null && q.data.rate > 0;
  return { q, rate: usable ? q.data!.rate as number : null, data: q.data as ExchangeRate | undefined };
}

const fmtTime = (d?: string | null) => d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'not reported';

export function RateNote({ currency, testId = 'text-rate-note' }: { currency: string; testId?: string }) {
  const { q, rate, data } = useUsdRate(currency);
  if (currency === 'USD') return null;
  if (q.isLoading) return <p className="fx-note" data-testid={testId}>Loading reference rate for {currency}…</p>;
  if (q.isError || !data) return <p className="fx-note fx-warn" role="alert" data-testid={testId}><AlertTriangle size={13}/> The {currency} reference rate could not be loaded, so no converted amounts are shown. USD amounts remain accurate. <button className="fx-retry" onClick={() => void q.refetch()} data-testid="button-retry-rate"><RefreshCw size={11}/> Retry</button></p>;
  if (!rate) return <p className="fx-note fx-warn" data-testid={testId}><AlertTriangle size={13}/> {data.status === 'stale' ? 'The reference rate is stale' : 'No reference rate is available'} for {currency}, so conversions are turned off. {data.note}</p>;
  return <p className="fx-note" data-testid={testId}>Reference rate: 1 USD = {rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {currency}, as of {data.asOf ?? 'unknown date'} (fetched {fmtTime(data.fetchedAt)}) from <a href={data.sourceUrl} target="_blank" rel="noreferrer">{new URL(data.sourceUrl).hostname}</a>. Estimates only; a bank or card provider will use its own rate and fees.</p>;
}

/** Saved budget for the signed-in student (null when signed out). */
export function useSavedBudget() {
  const { isSignedIn } = useUser();
  const q = useGetBudgetSettings({ query: { queryKey: getGetBudgetSettingsQueryKey(), enabled: !!isSignedIn, staleTime: 60_000, retry: 1 } });
  return { q, budget: isSignedIn ? q.data?.budget ?? null : null, isSignedIn: !!isSignedIn };
}

/**
 * Display currency that starts as USD, adopts the saved budget currency once per identity
 * (the query cache and tree are remounted per identity), and never overrides a user choice.
 */
export function usePreferredCurrency() {
  const { budget } = useSavedBudget();
  const [currency, setCurrencyState] = useState('USD');
  const touched = useRef(false); const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || touched.current || !budget?.budgetCurrency) return;
    initialized.current = true; setCurrencyState(budget.budgetCurrency);
  }, [budget?.budgetCurrency]);
  const setCurrency = (c: string) => { touched.current = true; setCurrencyState(c); };
  return [currency, setCurrency, budget] as const;
}
