import { Router, Request, Response, NextFunction } from "express";
import {
  loadProviderRegistry,
  validateProviderWallet,
} from "../services/custodian.js";

export const custodianRouter = Router();

/**
 * GET /api/custodian/providers
 * Returns the demo Custodian provider registry.
 */
custodianRouter.get(
  "/providers",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const registry = await loadProviderRegistry();
      res.json({
        success: true,
        registryName: registry.registryName,
        custodian: registry.custodian,
        version: registry.version,
        updatedAt: registry.updatedAt,
        providers: registry.providers,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/custodian/providers/:wallet/verify
 * Checks whether a provider wallet exists in the registry and is active.
 */
custodianRouter.get(
  "/providers/:wallet/verify",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wallet = Array.isArray(req.params.wallet)
        ? req.params.wallet[0]
        : req.params.wallet;
      const result = await validateProviderWallet(wallet);
      res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }
);
