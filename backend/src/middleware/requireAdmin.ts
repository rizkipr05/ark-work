import { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // DEV BYPASS: set DEV_ADMIN=1 di .env waktu development
  if (process.env.DEV_ADMIN === "1") return next();

  // contoh minimal: baca flag dari session/cookie
  const isAdmin =
    (req as any).user?.role === "admin" ||
    String(req.cookies?.ark_admin || "").toLowerCase() === "true";

  if (!isAdmin) return res.status(401).json({ message: "Unauthorized" });
  next();
}
