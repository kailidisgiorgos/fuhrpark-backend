import { Router, Request, Response } from "express";
import { pool } from "../db";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// GET /api/v1/vehicles
// Der ganze Fuhrpark, für alle Rollen sichtbar (keine sensiblen Daten).
// Welches Fahrzeug ein Fahrer HEUTE fährt, kommt aus /api/v1/assignments.
router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT * FROM vehicles ORDER BY created_at DESC");
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/vehicles – nur Admin
router.post("/", requireRole("admin"), async (req: Request, res: Response) => {
  const { license_plate, vin, brand, model, fuel_type, current_odometer_km } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO vehicles (license_plate, vin, brand, model, fuel_type, current_odometer_km)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [license_plate, vin || null, brand, model, fuel_type || "diesel", current_odometer_km || 0]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/vehicles/:id – nur Admin
router.put("/:id", requireRole("admin"), async (req: Request, res: Response) => {
  const { license_plate, vin, brand, model, fuel_type, current_odometer_km } = req.body;
  try {
    const result = await pool.query(
      `UPDATE vehicles SET license_plate = $1, vin = $2, brand = $3, model = $4,
        fuel_type = $5, current_odometer_km = $6
       WHERE id = $7 RETURNING *`,
      [license_plate, vin, brand, model, fuel_type, current_odometer_km, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Nicht gefunden." });
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/vehicles/:id – nur Admin
router.delete("/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM vehicles WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
