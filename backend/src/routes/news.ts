import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import Parser from 'rss-parser'
import pLimit from 'p-limit'
import { getPreviewImage } from '../utils/preview'

const router = Router()

/** ================= Rate limit ================= */
const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 })
router.use(limiter)

/** ================= RSS Parser ================= */
const parser = new Parser({
  headers: { 'User-Agent': 'arkwork-energy-news/2.0 (+https://arkwork.example)' },
  timeout: 15000,
})

/** ================= Google News helper =================
 * q: kata kunci (boleh mengandung operator Google News, mis: when:7d)
 * hl: language UI, gl: negara, ceid: pair country:lang
 */
function gnewsUrl(query: string, lang = 'en', country = 'US') {
  const base = 'https://news.google.com/rss/search'
  const p = new URLSearchParams({ q: query, hl: lang, gl: country, ceid: `${country}:${lang}` })
  return `${base}?${p.toString()}`
}

/** ================= CEID presets (lintas negara) =================
 * Pilihan populer lintas region. Tambahkan/ubah sesuai kebutuhan.
 * (Google News butuh pasangan gl/lang yang valid)
 */
const CEIDS_ALL = [
  { gl: 'US', hl: 'en' }, // North America
  { gl: 'CA', hl: 'en' },
  { gl: 'GB', hl: 'en' }, // Europe
  { gl: 'IE', hl: 'en' },
  { gl: 'DE', hl: 'de' },
  { gl: 'FR', hl: 'fr' },
  { gl: 'ES', hl: 'es' },
  { gl: 'IT', hl: 'it' },
  { gl: 'NL', hl: 'nl' },
  { gl: 'SE', hl: 'sv' },
  { gl: 'NO', hl: 'no' },
  { gl: 'PL', hl: 'pl' },
  { gl: 'RU', hl: 'ru' },
  { gl: 'TR', hl: 'tr' },
  { gl: 'AE', hl: 'ar' }, // Middle East
  { gl: 'SA', hl: 'ar' },
  { gl: 'QA', hl: 'ar' },
  { gl: 'EG', hl: 'ar' },
  { gl: 'ZA', hl: 'en' }, // Africa
  { gl: 'NG', hl: 'en' },
  { gl: 'IN', hl: 'en' }, // Asia
  { gl: 'ID', hl: 'id' },
  { gl: 'SG', hl: 'en' },
  { gl: 'MY', hl: 'ms' },
  { gl: 'PH', hl: 'en' },
  { gl: 'VN', hl: 'vi' },
  { gl: 'TH', hl: 'th' },
  { gl: 'JP', hl: 'ja' },
  { gl: 'KR', hl: 'ko' },
  { gl: 'CN', hl: 'zh-CN' },
  { gl: 'TW', hl: 'zh-TW' },
  { gl: 'AU', hl: 'en' }, // Oceania
  { gl: 'NZ', hl: 'en' },
  { gl: 'BR', hl: 'pt-BR' }, // LatAm
  { gl: 'MX', hl: 'es-419' },
  { gl: 'AR', hl: 'es-419' },
  { gl: 'CL', hl: 'es-419' },
]

/** ================= Queries preset ================= */
const ID_QUERIES = [
  '(migas OR minyak OR gas OR energi) site:esdm.go.id',
  '(migas OR minyak OR gas OR energi) site:katadata.co.id',
  '(migas OR minyak OR gas OR energi) site:cnbcindonesia.com',
  '(migas OR minyak OR gas OR energi) site:bisnis.com',
  '(migas OR minyak OR gas OR energi) site:cnnindonesia.com',
]

const GLOBAL_QUERIES = [
  '(oil OR gas OR LNG OR energy) site:reuters.com',
  '(oil OR gas OR LNG OR energy) site:bloomberg.com',
  '(oil OR gas OR LNG OR energy) site:ft.com',
  '(oil OR gas OR LNG OR energy) site:wsj.com',
  '(oil OR gas OR LNG OR energy) site:aljazeera.com',
]

/** Query default khusus O&G lintas negara (tanpa site:) */
const OIL_GAS_GLOBAL_DEFAULT =
  '(oil OR gas OR LNG OR petroleum OR refinery OR upstream OR downstream)'

/** ================= Root (opsional) ================= */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    usage:
      '/api/news/energy?scope=id|global|both&limit=20&lang=id|en&country=ID|US|ALL&when=14d&keywords=...',
    tip: 'Gunakan country=ALL untuk lintas negara. Gunakan when=7d/30d/48h agar lebih relevan.',
  })
})

/** ================= /energy ================= */
router.get('/energy', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20), 100)
    const scope = String(req.query.scope ?? 'both') // id | global | both
    const lang = String(req.query.lang ?? 'id')
    const country = String(req.query.country ?? 'ID') // ISO 2, atau "ALL"
    const when = String(req.query.when ?? '14d').trim() // Google News supports when:7d, 48h, etc.
    const customKeywords = (req.query.keywords ?? '').toString().trim()

    /** 1) Tentukan daftar query */
    let queries: string[] = []
    if (customKeywords) {
      // pakai custom, otomatis tambahkan when:.. jika belum ada
      const qHasWhen = /when:\s*\d+(?:h|d)/i.test(customKeywords)
      const qFinal = qHasWhen ? customKeywords : `${customKeywords} when:${when}`
      queries = [qFinal]
    } else {
      if (country.toUpperCase() === 'ALL') {
        // lintas negara: pakai query global generik (tanpa site:)
        queries = [`${OIL_GAS_GLOBAL_DEFAULT} when:${when}`]
      } else {
        // sesuai scope lama
        if (scope === 'id') queries = ID_QUERIES.map((q) => `${q} when:${when}`)
        else if (scope === 'global') queries = GLOBAL_QUERIES.map((q) => `${q} when:${when}`)
        else queries = [...ID_QUERIES, ...GLOBAL_QUERIES].map((q) => `${q} when:${when}`)
      }
    }

    /** 2) Ambil feed
     * - jika country=ALL -> loop banyak CEID
     * - jika country spesifik -> satu CEID (lang dari param)
     */
    type Item = { title: string; link: string; pubDate: string | null; source: string }
    const results: Item[] = []

    const fetchOneFeed = async (q: string, hl: string, gl: string) => {
      try {
        const feed = await parser.parseURL(gnewsUrl(q, hl, gl))
        const items = (feed.items ?? []).map((it) => ({
          title: it.title ?? '',
          link: it.link ?? '',
          pubDate: it.pubDate ? new Date(it.pubDate).toISOString() : null,
          source: (it as any).source || (it as any).creator || (it as any).author || 'Google News',
        }))
        return items
      } catch {
        return [] as Item[]
      }
    }

    if (country.toUpperCase() === 'ALL') {
      // concurrency batasi agar santun
      const ceidPool = CEIDS_ALL
      const run = pLimit(6)
      const tasks: Array<Promise<Item[]>> = []
      for (const ce of ceidPool) {
        for (const q of queries) {
          tasks.push(run(() => fetchOneFeed(q, ce.hl, ce.gl)))
        }
      }
      const chunks = await Promise.all(tasks)
      for (const arr of chunks) results.push(...arr)
    } else {
      // single CEID berdasarkan param
      const items = await Promise.all(
        queries.map((q) => fetchOneFeed(q, lang, country.toUpperCase()))
      )
      results.push(...items.flat())
    }

    /** 3) De-duplicate & sort */
    const norm = (u?: string) => (u ?? '').replace(/#.*$/, '').replace(/&utm_[^=]+=[^&]+/g, '')
    const seen = new Set<string>()
    const deduped = results.filter((a) => {
      const key = norm(a.link) || a.title
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    deduped.sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''))

    /** 4) Ambil og:image (limited concurrency) */
    const limitRun = pLimit(5)
    const withImages = await Promise.all(
      deduped.slice(0, limit).map((item) =>
        limitRun(async () => {
          const image = item.link ? await getPreviewImage(item.link) : null
          return { ...item, image }
        })
      )
    )

    res.json({
      scope: country.toUpperCase() === 'ALL' ? 'global-all' : scope,
      lang,
      country,
      when,
      count: withImages.length,
      items: withImages,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to fetch news' })
  }
})

export default router
