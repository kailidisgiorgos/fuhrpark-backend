import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db";
import { authenticate, requireRole, signToken } from "../middleware/auth";

const router = Router();

// POST /api/v1/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: "E-Mail und Passwort erforderlich." });
  }
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ success: false, error: "Ungültige Anmeldedaten." });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, error: "Ungültige Anmeldedaten." });

    const payload = { id: user.id, email: user.email, role: user.role, name: user.name };
    const token = signToken(payload);
    res.json({ success: true, data: { token, user: payload } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/auth/bootstrap-admin
// Legt genau EINMAL den ersten Admin-Account an – funktioniert nur, solange
// noch kein Admin in der Datenbank existiert. Danach 404.
router.post("/bootstrap-admin", async (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  try {
    const existing = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (existing.rows.length > 0) {
      return res.status(404).json({ success: false, error: "Bereits initialisiert." });
    }
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, error: "E-Mail, Passwort und Name erforderlich." });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin')
       RETURNING id, email, name, role`,
      [email.toLowerCase(), hash, name]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/v1/auth/users – Admin legt Fahrer-Accounts an
router.post("/users", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  const { email, password, name, role } = req.body;
  if (!email || !password || !name || !["admin", "driver"].includes(role)) {
    return res.status(400).json({ success: false, error: "E-Mail, Passwort, Name und gültige Rolle erforderlich." });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, created_at`,
      [email.toLowerCase(), hash, name, role]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/v1/auth/users – Admin sieht alle Accounts
router.get("/users", authenticate, requireRole("admin"), async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC"
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
