import { Router, Request, Response } from "express";
import { pool } from "../db";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();
router.use(authenticate);

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/v1/assignments?date=YYYY-MM-DD  (date optional, default heute)
// Admin: sieht alle Zuweisungen des Tages. Fahrer: nur die eigene.
router.get("/", async (req: Request, res: Response) => {
  const date = (req.query.date as string) || todayISO();
  try {
    if (req.user!.role === "admin") {
      const result = await pool.query(
        `SELECT a.*, v.license_plate, v.brand, v.model, u.name AS driver_name
         FROM driver_assignments a
         JOIN vehicles v ON v.id = a.vehicle_id
         JOIN users u ON u.id = a.driver_id
         WHERE a.assignment_date = $1
         ORDER BY u.name`,
        [date]
      );
      res.json({ success: true, data: result.rows });
    } else {
      const result = await pool.query(
        `SELECT a.*, v.license_plate, v.brand, v.model, v.fuel_type, v.current_odometer_km
         FROM driver_assignments a
         JOIN vehicles v ON v.id = a.vehicle_id
         WHERE a.assignment_date = $1 AND a.driver_id = $2`,
        [date, req.user!.id]
      );
      res.json({ success: true, data: result.rows });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/assignments/week?start=YYYY-MM-DD – admin, 7-Tage-Übersicht
router.get("/week", requireRole("admin"), async (req: Request, res: Response) => {
  const start = (req.query.start as string) || todayISO();
  try {
    const result = await pool.query(
      `SELECT a.*, v.license_plate, u.name AS driver_name
       FROM driver_assignments a
       JOIN vehicles v ON v.id = a.vehicle_id
       JOIN users u ON u.id = a.driver_id
       WHERE a.assignment_date >= $1::date AND a.assignment_date < $1::date + INTERVAL '7 days'
       ORDER BY a.assignment_date, u.name`,
      [start]
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/assignments – admin legt fest, wer welches Fahrzeug an welchem Tag fährt.
router.put("/", requireRole("admin"), async (req: Request, res: Response) => {
  const { driver_id, vehicle_id, assignment_date } = req.body;
  if (!driver_id || !vehicle_id || !assignment_date) {
    return res.status(400).json({ success: false, error: "driver_id, vehicle_id und assignment_date erforderlich." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO driver_assignments (driver_id, vehicle_id, assignment_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (driver_id, assignment_date)
       DO UPDATE SET vehicle_id = EXCLUDED.vehicle_id
       RETURNING *`,
      [driver_id, vehicle_id, assignment_date]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ success: false, error: "Dieses Fahrzeug ist an dem Tag bereits einem anderen Fahrer zugewiesen." });
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/assignments/:id – admin entfernt eine Zuweisung
router.delete("/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM driver_assignments WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
