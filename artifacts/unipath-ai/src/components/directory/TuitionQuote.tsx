import type { TuitionQuote } from '@workspace/api-client-react';
import { RateNote, fmtMoney, useUsdRate } from '@/components/money/currency';

export const TUITION_LABELS = {
  in_state: 'U.S. in-state', out_of_state: 'U.S. out-of-state',
  domestic: 'Domestic', international: 'International',
} as const;

/** A cross rate always uses two dated USD reference rates, never a relabeled amount. */
export function useTuitionFactor(native: string, display: string, displayRate: number | null) {
  const source = useUsdRate(native);
  return native === display ? 1 : source.rate && displayRate ? displayRate / source.rate : null;
}

export function QuoteAmount({ quote, currency, rate }: { quote?: TuitionQuote; currency: string; rate: number | null }) {
  const factor = useTuitionFactor(quote?.currency ?? 'USD', currency, rate);
  if (!quote) return <span className="cmp-unknown">Not reported</span>;
  return <>
    <strong>{fmtMoney(quote.amount, quote.currency)}</strong>
    <small>{quote.currency} per academic year</small>
    {currency !== quote.currency && <small>{factor !== null
      ? `about ${currency} ${fmtMoney(quote.amount * factor, currency)} / year`
      : `Conversion to ${currency} unavailable; original amount shown`}</small>}
    <small>Academic year {quote.academicYear} · {quote.status === 'outdated' ? 'outdated source figure' : 'source-reported, confirm current fees'}</small>
    <small>{quote.scope}</small>
  </>;
}

export function QuoteSource({ quote }: { quote: TuitionQuote }) {
  return <div className="tu-meta">
    <a className="text-link" href={quote.sourceUrl} target="_blank" rel="noreferrer">{quote.sourceName}</a>
    <a className="text-link" href={quote.sourceFileUrl} target="_blank" rel="noreferrer">Source file</a>
    <a className="text-link" href={quote.sourceLicenseUrl} target="_blank" rel="noreferrer">Reuse terms</a>
    <small>{quote.attribution}</small>
    <small>Source publication: {quote.sourcePublishedAt ?? 'not supplied'} · Imported {new Date(quote.importedAt).toLocaleDateString()}</small>
  </div>;
}

export function TuitionSourceRates({ quotes, currency }: { quotes: TuitionQuote[]; currency: string }) {
  const currencies = [...new Set(quotes.map(q => q.currency))].filter(c => c !== 'USD' && c !== currency);
  return <>{currencies.map(c => <div key={c}><small>Source-currency conversion also uses:</small><RateNote currency={c} testId={`text-source-rate-${c}`}/></div>)}</>;
}
