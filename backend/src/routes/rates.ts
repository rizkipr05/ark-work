import { Router } from 'express';

const router = Router();

/**
 * GET /api/rates?base=USD&symbols=IDR
 * Balikkan { rate: number, base, symbol, provider }
 */
router.get('/', async (req, res) => {
  const base = String(req.query.base || 'USD').toUpperCase();
  const symbol = String(req.query.symbols || req.query.symbol || 'IDR').toUpperCase();

  try {
    // provider gratis tanpa API key
    const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    if (!data?.rates?.[symbol]) {
      return res.status(400).json({ error: 'RATE_NOT_FOUND', base, symbol });
    }

    return res.json({
      rate: Number(data.rates[symbol]),
      base,
      symbol,
      provider: 'open.er-api.com',
      updated_at: data.time_last_update_utc
    });
  } catch (e) {
    console.error('RATE_FETCH_FAILED', e);
    return res.status(500).json({ error: 'RATE_FETCH_FAILED' });
  }
});

export default router;
