import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] JWT_SECRET environment variable is required in production!');
    process.exit(1);
  }
  return "autopro-dev-secret-DO-NOT-USE-IN-PROD";
})();

export { JWT_SECRET };

export function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "غير مخوَّل — يرجى تسجيل الدخول" });
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "جلسة منتهية — يرجى إعادة تسجيل الدخول" });
  }
}

export function requireAdmin(req: any, res: any, next: any) {
  authenticateToken(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — صلاحيات المدير مطلوبة" });
    }
    next();
  });
}

export function requireAuth(req: any, res: any, next: any) {
  authenticateToken(req, res, () => next());
}
