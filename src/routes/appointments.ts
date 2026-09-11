import { Router, Request, Response } from "express";
import { pool } from "../db";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// Fährt dieser Fahrer heute dieses Fahrzeug laut Einsatzplan?
async function driverAssignedToday(driverId: number, vehicleId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM driver_assignments
     WHERE driver_id = $1 AND vehicle_id = $2 AND assignment_date = CURRENT_DATE`,
    [driverId, vehicleId]
  );
  return (result.rowCount ?? 0) > 0;
}

// GET /api/v1/appointments
// Admin: alle Termine. Fahrer: die Termine, die er selbst angefragt hat
// (Zuordnung über requested_by, da sich das Fahrzeug pro Fahrer täglich ändern kann).
router.get("/", async (req: Request, res: Response) => {
  try {
    const query =
      req.user!.role === "admin"
        ? "SELECT * FROM appointments ORDER BY scheduled_date ASC"
        : "SELECT * FROM appointments WHERE requested_by = $1 ORDER BY scheduled_date ASC";
    const params = req.user!.role === "admin" ? [] : [req.user!.id];
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/appointments
// Fahrer: kann nur für das Fahrzeug, das er laut Einsatzplan HEUTE fährt, einen
// Termin ANFRAGEN (status = requested). Admin: kann für jedes Fahrzeug direkt anlegen.
router.post("/", async (req: Request, res: Response) => {
  const { vehicle_id, service_type, scheduled_date, notes } = req.body;
  try {
    if (req.user!.role === "driver") {
      const assigned = await driverAssignedToday(req.user!.id, vehicle_id);
      if (!assigned) {
        return res.status(403).json({ success: false, error: "Du fährst dieses Fahrzeug heute nicht laut Einsatzplan." });
      }
    }
    const result = await pool.query(
      `INSERT INTO appointments (vehicle_id, service_type, scheduled_date, notes, requested_by, status)
       VALUES ($1, $2, $3, $4, $5, 'requested') RETURNING *`,
      [vehicle_id, service_type, scheduled_date, notes || null, req.user!.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/appointments/:id/status – nur Admin (genehmigen / erledigt / stornieren)
router.put("/:id/status", requireRole("admin"), async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!["requested", "approved", "completed", "cancelled"].includes(status)) {
    return res.status(400).json({ success: false, error: "Ungültiger Status." });
  }
  try {
    const result = await pool.query(
      "UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *",
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Nicht gefunden." });
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/appointments/:id – nur Admin
router.delete("/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM appointments WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
