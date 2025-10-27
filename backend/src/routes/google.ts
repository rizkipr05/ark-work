// backend/src/routes/google.ts
import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma'; // sesuaikan path; pastikan prisma client export exists

const router = express.Router();

/**
 * Passport Google strategy
 * - CALLBACK URL: `${BACKEND_URL}/auth/google/callback`
 * - Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BACKEND_URL, FRONTEND_URL, JWT_SECRET
 */
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  callbackURL: `${process.env.BACKEND_URL || 'http://localhost:4000'}/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error('No email from Google'));

    const photo = profile.photos?.[0]?.value ?? null;
    const provider = 'google';
    const providerId = profile.id;

    // find existing by oauthProvider+oauthId first (preferred)
    let user = null;
    if (provider && providerId) {
      user = await prisma.user.findFirst({
        where: {
          oauthProvider: provider,
          oauthId: providerId
        }
      });
    }

    // fallback: find by email (existing local account)
    if (!user) {
      user = await prisma.user.findUnique({ where: { email } });
    }

    if (!user) {
      // create user without passwordHash (nullable in schema)
      user = await prisma.user.create({
        data: {
          name: profile.displayName ?? undefined,
          email,
          photoUrl: photo ?? undefined,
          oauthProvider: provider,
          oauthId: providerId,
        }
      });
    } else {
      // update oauth fields & profile if needed
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: profile.displayName ?? user.name,
          photoUrl: photo ?? user.photoUrl,
          oauthProvider: user.oauthProvider ?? provider,
          oauthId: user.oauthId ?? providerId,
        },
      });
    }

    return done(null, user);
  } catch (err) {
    return done(err as Error);
  }
}));

// serialize/deserialize (not used for JWT flow but harmless)
passport.serializeUser((user: any, done) => done(null, user.id));
passport.deserializeUser(async (id: string, done) => {
  const user = await prisma.user.findUnique({ where: { id }});
  done(null, user);
});

// start OAuth flow
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// callback route
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/auth?error=google` }),
  (req, res) => {
    const user = (req as any).user;
    if (!user) return res.redirect(`${process.env.FRONTEND_URL}/auth?error=google`);

    const token = jwt.sign(
      { sub: user.id, role: user.role ?? 'user' },
      process.env.JWT_SECRET || 'devsecret',
      { expiresIn: '7d' }
    );

    // set httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // redirect back to frontend; frontend akan memanggil /me untuk ambil user
    return res.redirect(`${process.env.FRONTEND_URL}/auth?from=google`);
  }
);

export default router;
