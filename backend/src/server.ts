import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { recordsRouter } from "./routes/records.js";
import { healthRouter } from "./routes/health.js";
import { custodianRouter } from "./routes/custodian.js";
import { emergencyRouter } from "./routes/emergency.js";
import { initializeEmergencyService, startEventListener } from "./services/emergency.js";

dotenv.config({ path: "../.env" });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.use("/api/health", healthRouter);
app.use("/api/records", recordsRouter);
app.use("/api/custodian", custodianRouter);
app.use("/api/emergency", emergencyRouter);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err.message);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
);

app.listen(PORT, async () => {
  console.log(`Backend running on http://localhost:${PORT}`);

  const emergencyInitialized = await initializeEmergencyService();
  if (emergencyInitialized && process.env.AUTO_START_EMERGENCY_LISTENER === "true") {
    await startEventListener();
    console.log("Emergency event listener auto-started");
  }
});

export default app;
