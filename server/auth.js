import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "lingxi_dev_secret";
const JWT_EXPIRES = "30d";

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ ok: false, error: "unauthorized" });
  try {
    const decoded = verifyToken(token);
    req.auth = decoded;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "invalid_token" });
  }
}

export function adminOnly(req, res, next) {
  if (!req.auth || req.auth.role !== "admin") return res.status(403).json({ ok: false, error: "forbidden" });
  return next();
}
