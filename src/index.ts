import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth";
import vehicleRoutes from "./routes/vehicles";
import appointmentRoutes from "./routes/appointments";
import logRoutes from "./routes/logs";
import assignmentRoutes from "./routes/assignments";

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET fehlt in den Umgebungsvariablen (.env). Server wird nicht gestartet.");
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/api/v1/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", message: "Fuhrpark Manager API läuft" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/vehicles", vehicleRoutes);
app.use("/api/v1/appointments", appointmentRoutes);
app.use("/api/v1/logs", logRoutes);
app.use("/api/v1/assignments", assignmentRoutes);

app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});
