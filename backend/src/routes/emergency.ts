import { Router, Request, Response } from "express";
import {
  initializeEmergencyService,
  getPendingSessions,
  getSession,
  processSession,
  processPendingSessions,
  startEventListener,
  stopEventListener,
  isListenerActive,
  isServiceInitialized,
  isWriteEnabled,
  getEmergencyConfig,
} from "../services/emergency.js";

export const emergencyRouter = Router();

emergencyRouter.get("/status", (_req: Request, res: Response): void => {
  const config = getEmergencyConfig();

  res.json({
    initialized: isServiceInitialized(),
    writeEnabled: isWriteEnabled(),
    listenerActive: isListenerActive(),
    emergencyAccessAddress: config.emergencyAccessAddress || null,
    rpcUrl: config.rpcUrl,
  });
});

emergencyRouter.post("/initialize", async (_req: Request, res: Response): Promise<void> => {
  try {
    const success = await initializeEmergencyService();

    if (success) {
      res.json({
        success: true,
        message: "Emergency service initialized",
        writeEnabled: isWriteEnabled(),
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to initialize emergency service - check configuration",
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

emergencyRouter.get("/pending", async (_req: Request, res: Response): Promise<void> => {
  if (!isServiceInitialized()) {
    res.status(503).json({ error: "Emergency service not initialized" });
    return;
  }

  try {
    const sessions = await getPendingSessions();

    const formatted = sessions.map((s) => ({
      sessionId: String(s.sessionId),
      patient: s.patient,
      doctor: s.doctor,
      status: s.status,
      triggerType: s.triggerType,
      triggeredAt: new Date(Number(s.triggeredAt) * 1000).toISOString(),
    }));

    res.json({ pending: formatted, count: formatted.length });
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch pending sessions",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

emergencyRouter.get("/session/:sessionId", async (req: Request, res: Response): Promise<void> => {
  if (!isServiceInitialized()) {
    res.status(503).json({ error: "Emergency service not initialized" });
    return;
  }

  try {
    const sessionIdParam = Array.isArray(req.params.sessionId)
      ? req.params.sessionId[0]
      : req.params.sessionId;

    const sessionId = BigInt(sessionIdParam);
    const session = await getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.json({
      sessionId: String(session.sessionId),
      patient: session.patient,
      doctor: session.doctor,
      status: session.status,
      triggerType: session.triggerType,
      triggeredAt: new Date(Number(session.triggeredAt) * 1000).toISOString(),
      activatedAt: session.activatedAt > 0
        ? new Date(Number(session.activatedAt) * 1000).toISOString()
        : null,
      expiresAt: session.expiresAt > 0
        ? new Date(Number(session.expiresAt) * 1000).toISOString()
        : null,
      recordsAccessed: Number(session.recordsAccessed),
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch session",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

emergencyRouter.post("/process/:sessionId", async (req: Request, res: Response): Promise<void> => {
  if (!isServiceInitialized()) {
    res.status(503).json({ error: "Emergency service not initialized" });
    return;
  }

  if (!isWriteEnabled()) {
    res.status(403).json({ error: "Emergency service is in read-only mode (no CUSTODIAN_PRIVATE_KEY)" });
    return;
  }

  try {
    const sessionIdParam = Array.isArray(req.params.sessionId)
      ? req.params.sessionId[0]
      : req.params.sessionId;

    const sessionId = BigInt(sessionIdParam);
    const result = await processSession(sessionId);

    res.json({
      success: true,
      result,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

emergencyRouter.post("/process-all", async (_req: Request, res: Response): Promise<void> => {
  if (!isServiceInitialized()) {
    res.status(503).json({ error: "Emergency service not initialized" });
    return;
  }

  if (!isWriteEnabled()) {
    res.status(403).json({ error: "Emergency service is in read-only mode (no CUSTODIAN_PRIVATE_KEY)" });
    return;
  }

  try {
    const results = await processPendingSessions();

    res.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

emergencyRouter.post("/listener/start", async (_req: Request, res: Response): Promise<void> => {
  if (!isServiceInitialized()) {
    res.status(503).json({ error: "Emergency service not initialized" });
    return;
  }

  if (!isWriteEnabled()) {
    res.status(403).json({ error: "Cannot start listener in read-only mode" });
    return;
  }

  try {
    await startEventListener();
    res.json({ success: true, message: "Event listener started" });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

emergencyRouter.post("/listener/stop", (_req: Request, res: Response): void => {
  const stopped = stopEventListener();
  res.json({
    success: stopped,
    message: stopped ? "Event listener stopped" : "Listener was not active",
  });
});
