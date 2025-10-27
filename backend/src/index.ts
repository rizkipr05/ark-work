// backend/src/index.ts
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import http from 'node:http';
import morgan from 'morgan';
import session from 'express-session';
import passport from 'passport';

// Routes
import authRouter from './routes/auth'; // ✅ pakai auth.ts (bukan auths)
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

// Admin Jobs router
import adminJobsRouter from './routes/admin-jobs';

// DEV helper routes (mis. set cookie emp_session, dll)
import authDev from './routes/auth-dev';

// 🔔 Dev mail testing
import devBillingMailRouter from './routes/dev-billing-mail';

import { authRequired, employerRequired, adminRequired } from './middleware/role';

// 🔔 Aktifkan CRON billing (warning + recompute)
import './jobs/billingCron';

// const googleRouter = require('./routes/google'); // ❌ jangan aktifkan dulu

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
const allowedOrigins = Array.from(
  new Set([
    ...defaultAllowed,
    ...FRONTEND_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  ])
);

function isLocalhost(origin?: string) {
  try {
    if (!origin) return false;
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function isVercel(origin?: string) {
  try {
    if (!origin) return false;
    const { hostname } = new URL(origin);
    return hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    // server-to-server (mis. Midtrans webhook) biasanya tanpa Origin → izinkan
    if (!origin) return cb(null, true);
    if (
      allowedOrigins.includes(origin) ||
      isLocalhost(origin) ||
      isVercel(origin)
    )
      return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Employer-Id',
    'x-employer-id',
  ],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/* Trust proxy saat produksi (cookie secure, IP asli, dst) */
if (NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

/* Cookie parser */
app.use(cookieParser());

/* ====== Session & Passport (must be before route that uses passport) ====== */
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_session_secret';
app.use(
  session({
    name: 'arkwork.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: NODE_ENV === 'production', // HTTPS in production
      sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
  })
);

// Initialize passport AFTER session middleware
app.use(passport.initialize());
app.use(passport.session());

/* BigInt -> string (safe untuk res.json) */
app.use((_req, res, next) => {
  const old = res.json.bind(res);
  function conv(x: any): any {
    if (x === null || x === undefined) return x;
    if (typeof x === 'bigint') return x.toString();
    if (Array.isArray(x)) return x.map(conv);
    if (typeof x === 'object') {
      const o: any = {};
      for (const k of Object.keys(x)) o[k] = conv((x as any)[k]);
      return o;
    }
    return x;
  }
  res.json = (body?: any) => old(conv(body));
  next();
});

/* Log sederhana & static */
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

/* ========= HEALTH ========= */
app.get('/', (_req, res) => res.send('OK'));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/health', (_req, res) => res.json({ ok: true, status: 'healthy' }));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

/* ========= DEV ROUTES (only enabled if DEV_AUTH=1 and not production) ========= */
if (NODE_ENV !== 'production' && process.env.DEV_AUTH === '1') {
  app.use(authDev);
  app.use(devBillingMailRouter);
}

/* ================= ROUTES (ORDER MATTERS!) ================= */

/* Public / auth routes */
app.use('/auth', authRouter); // ✅ pastikan file ini adalah ./routes/auth.ts

/* Employer */
app.use('/api/employers/auth', employerAuthRouter);
app.use('/api/employers', employerRouter);
app.use('/api/employers/applications', employerApplicationsRouter);

/* Public APIs */
app.use('/api/reports', reportsRouter);
app.use('/api/news', newsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/rates', ratesRouter);
app.use('/api/tenders', tendersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api', jobsRouter);
app.use('/api', applicationsRouter);

/* ========== ADMIN API (all admin endpoints under /api/admin/*) ========== */
app.use('/api/admin', adminRouter);
app.use('/api/admin/jobs', adminJobsRouter);
app.use('/api/admin/tenders', adminTendersRouter);
app.use('/api/admin/plans', adminPlansRouter);

/* Example protected endpoints */
app.get('/api/profile', authRequired, (req, res) =>
  res.json({ ok: true, whoami: (req as any).auth })
);
app.get('/api/employer/dashboard', employerRequired, (_req, res) =>
  res.json({ ok: true, message: 'Employer-only area' })
);
app.post('/api/admin/stats', adminRequired, (_req, res) =>
  res.json({ ok: true })
);

/* 404 */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

/* Error handler (WAJIB 4 argumen) */
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  if (err instanceof Error && err.message.startsWith('Not allowed by CORS')) {
    return res.status(403).json({ error: 'CORS: Origin not allowed' });
  }
  const status = (typeof err?.status === 'number' && err.status) || 500;
  const msg = NODE_ENV !== 'production' ? err?.message : 'Internal server error';
  res.status(status).json({ error: msg });
});

/* Start Server */
function startServer(port: number) {
  const server = http.createServer(app);
  server.listen(port);
  server.on('listening', () => {
    console.log('========================================');
    console.log(`🚀 Backend listening on http://localhost:${port}`);
    console.log(`NODE_ENV           : ${NODE_ENV}`);
    console.log(`FRONTEND_ORIGIN(s) : ${allowedOrigins.join(', ')}`);
    console.log('✅ Billing CRON     : loaded (via import ./jobs/billingCron)');
    if (NODE_ENV !== 'production' && process.env.DEV_AUTH === '1') {
      console.log('✅ Dev mail route   : GET /dev/mail/try (dev only)');
      console.log('✅ Dev auth routes  : enabled (dev only)');
    }
    console.log('✅ Passport-ready   : passport initialized and session enabled');
    console.log('========================================');
  });
}

startServer(DEFAULT_PORT);
