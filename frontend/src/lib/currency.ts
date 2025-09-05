export const fmtIDR = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
export const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export async function getRate(base: 'USD'|'IDR', symbols: 'USD'|'IDR'): Promise<number> {
  const r = await fetch(`/api/rates?base=${base}&symbols=${symbols}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('Rate API error');
  const j = await r.json();
  return Number(j?.rate);
}

export async function usdToIdr(usd: number): Promise<number> {
  const rate = await getRate('USD', 'IDR');
  return usd * rate;
}
export async function idrToUsd(idr: number): Promise<number> {
  const rate = await getRate('IDR', 'USD');
  return idr * rate;
}
