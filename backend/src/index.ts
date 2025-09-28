import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import http from 'node:http';
import morgan from 'morgan';

import authRouter from './routes/auth';
import newsRouter from './routes/news';
import chatRouter from './routes/chat';
import adminRouter from './routes/admin';
import { employerRouter } from './routes/employer';
import employerAuthRouter from './routes/employer-auth';
import adminPlansRouter from './routes/admin-plans';
import paymentsRouter from './routes/payments';
import tendersRouter from './routes/tenders';
import adminTendersRouter from './routes/admin-tenders';
import { jobsRouter } from './routes/jobs';
import reportsRouter from './routes/reports';
import ratesRouter from './routes/rates';

// NEW
import applicationsRouter from './routes/applications';
import employerApplicationsRouter from './routes/employer-applications';

import { authRequired, employerRequired, adminRequired } from './middleware/role';

const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEFAULT_PORT = Number(process.env.PORT || 4000);

/* ======= Matikan ETag agar tidak 304 selama debugging ======= */
app.set('etag', false);

/* ======= CORS ======= */
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const defaultAllowed = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const allowedOrigins = Array.from(new Set([
  ...defaultAllowed,
  ...FRONTEND_ORIGIN.split(',').map(s => s.trim()).filter(Boolean),
]));
function isLocalhost(origin?: string) {
  try { if (!origin) return false; const { hostname } = new URL(origin); return hostname === 'localhost' || hostname === '127.0.0.1'; } catch { return false; }
}
function isVercel(origin?: string) {
  try { if (!origin) return false; const { hostname } = new URL(origin); return hostname.endsWith('.vercel.app'); } catch { return false; }
}
const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin) || isLocalhost(origin) || isVercel(origin)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Employer-Id'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

if (NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(morgan('dev'));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

/* BigInt -> string */
app.use((_req, res, next) => {
  const old = res.json.bind(res);
  function conv(x: any): any {
    if (x === null || x === undefined) return x;
    if (typeof x === 'bigint') return x.toString();
    if (Array.isArray(x)) return x.map(conv);
    if (typeof x === 'object') { const o: any = {}; for (const k of Object.keys(x)) o[k] = conv(x[k]); return o; }
    return x;
  }
  res.json = (body?: any) => old(conv(body));
  next();
});

/* Log & static */
app.use((req, res, next) => { console.log(`${req.method} ${req.originalUrl}`); next(); });
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

/* Health */
app.get('/', (_req, res) => res.send('OK'));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/health', (_req, res) => res.json({ ok: true, status: 'healthy' }));

/* ================= ROUTES (ORDER MATTERS!) ================= */
/* SPECIFIC first */
// NEW: Employers read applications — DITARUH SEBELUM /api/employers
app.use('/api/employers/applications', employerApplicationsRouter);

/* Auth kandidat/user */
app.use('/auth', authRouter);

/* Employer auth (signup/signin/signout/me) */
app.use('/api/employers/auth', employerAuthRouter);

/* Employer features (step1–5, profile, dll)  */
app.use('/api/employers', employerRouter);

/* Admin, dsb */
app.use('/admin', adminRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/news', newsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/rates', ratesRouter);
app.use('/api/tenders', tendersRouter);
app.use('/admin/tenders', adminTendersRouter);
app.use('/admin/plans', adminPlansRouter);
app.use('/api/payments', paymentsRouter);

/* Jobs API (existing) */
app.use('/api', jobsRouter);

/* Applications API (candidate applies) */
app.use('/api/applications', applicationsRouter);

/* Protected examples */
app.get('/api/profile', authRequired, (req, res) => res.json({ ok: true, whoami: (req as any).auth }));
app.get('/api/employer/dashboard', employerRequired, (req, res) => res.json({ ok: true, message: 'Employer-only area' }));
app.post('/api/admin/stats', adminRequired, (req, res) => res.json({ ok: true }));

/* 404 */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

/* Error */
app.use((err: any, _req: Request, res: Response) => {
  console.error('Unhandled error:', err);
  if (err instanceof Error && err.message.startsWith('Not allowed by CORS')) {
    return res.status(403).json({ error: 'CORS: Origin not allowed' });
  }
  const msg = NODE_ENV !== 'production' ? err?.message : 'Internal server error';
  res.status(500).json({ error: msg });
});

/* Start */
function startServer(port: number) {
  const server = http.createServer(app);
  server.listen(port);
  server.on('listening', () => {
    console.log('========================================');
    console.log(`🚀 Backend listening on http://localhost:${port}`);
    console.log(`NODE_ENV           : ${NODE_ENV}`);
    console.log(`FRONTEND_ORIGIN(s) : ${allowedOrigins.join(', ')}`);
    console.log('========================================');
  });
}
startServer(DEFAULT_PORT);
