import { Router, Request, Response } from "express";
import { pool } from "../db";
import { authenticate } from "../middleware/auth";

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

// GET /api/v1/logs – Admin: alle (optional ?vehicle_id=), Fahrer: nur die eigenen Einträge
router.get("/", async (req: Request, res: Response) => {
  try {
    const vehicleFilter = req.query.vehicle_id ? Number(req.query.vehicle_id) : null;
    let query: string;
    let params: any[];

    if (req.user!.role === "admin") {
      query = vehicleFilter
        ? "SELECT * FROM vehicle_logs WHERE vehicle_id = $1 ORDER BY created_at DESC"
        : "SELECT * FROM vehicle_logs ORDER BY created_at DESC";
      params = vehicleFilter ? [vehicleFilter] : [];
    } else {
      query = `SELECT * FROM vehicle_logs WHERE driver_id = $1 ${vehicleFilter ? "AND vehicle_id = $2" : ""}
                ORDER BY created_at DESC`;
      params = vehicleFilter ? [req.user!.id, vehicleFilter] : [req.user!.id];
    }
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/logs
// Fahrer erfasst Kilometerstand oder meldet eine Störung für das Fahrzeug, das er
// laut Einsatzplan HEUTE fährt. Bei log_type = 'mileage' wird zusätzlich
// current_odometer_km am Fahrzeug aktualisiert.
router.post("/", async (req: Request, res: Response) => {
  const { vehicle_id, log_type, odometer_km, description } = req.body;
  if (!["mileage", "issue"].includes(log_type)) {
    return res.status(400).json({ success: false, error: "log_type muss 'mileage' oder 'issue' sein." });
  }
  try {
    if (req.user!.role === "driver") {
      const assigned = await driverAssignedToday(req.user!.id, vehicle_id);
      if (!assigned) {
        return res.status(403).json({ success: false, error: "Du fährst dieses Fahrzeug heute nicht laut Einsatzplan." });
      }
    }
    const result = await pool.query(
      `INSERT INTO vehicle_logs (vehicle_id, driver_id, log_type, odometer_km, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [vehicle_id, req.user!.id, log_type, odometer_km || null, description || null]
    );

    if (log_type === "mileage" && odometer_km) {
      await pool.query("UPDATE vehicles SET current_odometer_km = $1 WHERE id = $2", [odometer_km, vehicle_id]);
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
