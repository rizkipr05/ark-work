// frontend/src/lib/api.ts
/* ====================== Base URL ====================== */
/**
 * Use one of env:
 * - NEXT_PUBLIC_API_URL or NEXT_PUBLIC_API_BASE
 * Fallback: http://localhost:4000
 */
const RAW_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  'http://localhost:4000';

export const API_BASE = RAW_BASE.replace(/\/+$/, '');

/* ====================== Debug / feature flags ====================== */
/**
 * If you want to bypass Next.js rewrites and call backend directly from browser
 * (recommended for local dev to avoid Set-Cookie/proxy issues), set:
 *   NEXT_PUBLIC_FORCE_DIRECT_API=true
 */
const FORCE_DIRECT_API = (process.env.NEXT_PUBLIC_FORCE_DIRECT_API || 'false') === 'true';

const SKIP_EMPLOYER_CHECK = (process.env.NEXT_PUBLIC_SKIP_EMPLOYER_CHECK || 'false') === 'true';

type ApiOpts = RequestInit & {
  json?: any;
  expectJson?: boolean;
};

/* ====================== URL helpers ====================== */
/**
 * Rules:
 * - If path is absolute (http(s)://) -> return as-is
 * - If running in browser and FORCE_DIRECT_API=true -> always return absolute API_BASE + path
 * - Otherwise leave '/api' or '/auth' paths relative so Next rewrites can proxy them
 * - Non-/api paths (custom) are prefixed with API_BASE
 */
function buildUrl(path: string) {
  if (!path) return API_BASE;
  if (/^https?:\/\//i.test(path)) return path;

  // If force-direct is enabled (dev), call backend directly to avoid proxy cookie issues
  if (typeof window !== 'undefined' && FORCE_DIRECT_API) {
    // ensure leading slash
    return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  // otherwise prefer relative path for Next rewrite proxy (when not forcing direct)
  if (path.startsWith('/')) return path;

  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

function withQs(base: string, params?: Record<string, any>) {
  if (!params) return base;
  const origin = typeof window !== 'undefined' ? window.location.origin : API_BASE;
  const u = new URL(base.startsWith('/') ? `${origin}${base}` : base);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    u.searchParams.set(k, String(v));
  }
  if (base.startsWith('/')) {
    return `${u.pathname}${u.search}`;
  }
  return u.toString();
}

/* ====================== Error helpers ====================== */
async function readErrorMessage(res: Response) {
  try {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data: any = await res.json().catch(() => ({}));
      return data?.message || data?.error || `HTTP ${res.status}`;
    }
    const text = await res.text();
    return text || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/* ====================== Public helper: join root + path ====================== */
export const API = (path: string) => {
  if (!path) return API_BASE;
  if (/^https?:\/\//i.test(path)) return path;
  // if forcing direct or in production, use absolute
  if (typeof window !== 'undefined' && FORCE_DIRECT_API) {
    return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  }
  return path.startsWith('/') ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
};

/* ====================== Main fetch wrapper ====================== */
export async function api<T = any>(path: string, opts: ApiOpts = {}): Promise<T> {
  const { json, headers, expectJson = true, ...rest } = opts;

  // debug trace for employer endpoints
  try {
    const lower = String(path || '').toLowerCase();
    if (lower.includes('/api/employers')) {
      console.log(`[TRACE][api] Employer endpoint called: ${path}`);
      console.trace();
      if (SKIP_EMPLOYER_CHECK) {
        throw new Error(`[SKIP_EMPLOYER_CHECK] skipped call to ${path}`);
      }
    }
  } catch (e) {
    console.warn('[TRACE][api] trace helper error (ignored):', e);
  }

  const h = new Headers(headers || {});
  const sendingFormData = (rest as any).body instanceof FormData;
  const willSendJson = json !== undefined && !sendingFormData;

  if (willSendJson) h.set('Content-Type', 'application/json');

  const init: RequestInit = {
    credentials: 'include',
    headers: h,
    ...(json !== undefined ? { method: (rest.method ?? 'POST'), body: JSON.stringify(json) } : {}),
    ...rest,
  };

  const url = buildUrl(path);
  // console.log('[api] fetch', url, init);
  const res = await fetch(url, init);

  if (!res.ok) {
    throw new Error(`[${res.status}] ${url} ${await readErrorMessage(res)}`);
  }

  if (res.status === 204 || !expectJson) {
    // @ts-expect-error
    return null;
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return (await res.text()) as unknown as T;
  }

  return (await res.json()) as T;
}

/* =================== Helper khusus FormData / Upload =================== */
export async function apiForm<T = any>(path: string, form: FormData, opts: RequestInit = {}): Promise<T> {
  try {
    const lower = String(path || '').toLowerCase();
    if (lower.includes('/api/employers')) {
      console.log(`[TRACE][apiForm] Employer endpoint called: ${path}`);
      console.trace();
      if (SKIP_EMPLOYER_CHECK) throw new Error(`[SKIP_EMPLOYER_CHECK] skipped call to ${path}`);
    }
  } catch (e) {
    console.warn('[TRACE][apiForm] trace helper error (ignored):', e);
  }

  const url = buildUrl(path);
  const res = await fetch(url, {
    method: 'POST',
    body: form,
    credentials: 'include',
    ...opts,
  });

  if (!res.ok) {
    throw new Error(`[${res.status}] ${url} ${await readErrorMessage(res)}`);
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    // @ts-expect-error
    return null;
  }
  return (await res.json()) as T;
}

/* ================== Rates helpers (unchanged) */
export async function getRateUSDToIDR(): Promise<number> {
  const url = withQs(`${API_BASE}/api/rates`, { base: 'USD', symbols: 'IDR' });
  const res = await fetch(url, { cache: 'no-store', credentials: 'include' });
  if (!res.ok) throw new Error(`[${res.status}] ${await readErrorMessage(res)}`);
  const j: any = await res.json().catch(() => ({}));
  const rate = Number(j?.rate);
  if (!Number.isFinite(rate)) throw new Error('Invalid rate');
  return rate;
}

export async function getRate(base: string, symbol: string): Promise<number> {
  const url = withQs(`${API_BASE}/api/rates`, { base, symbols: symbol });
  const res = await fetch(url, { cache: 'no-store', credentials: 'include' });
  if (!res.ok) throw new Error(`[${res.status}] ${await readErrorMessage(res)}`);
  const j: any = await res.json().catch(() => ({}));
  const rate = Number(j?.rate);
  if (!Number.isFinite(rate)) throw new Error('Invalid rate');
  return rate;
}

/* ================== (rest of file: RSS helpers) keep as you had them */
