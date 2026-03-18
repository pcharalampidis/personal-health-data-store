import { Router, Request, Response, NextFunction } from "express";
import { pinToIPFS, fetchFromIPFS, unpinFromIPFS } from "../services/ipfs.js";

export const recordsRouter = Router();

/**
 * POST /api/records/upload
 * Receives already-encrypted file content from the frontend and pins it to IPFS.
 * Returns the IPFS CID for the frontend to store on-chain via RecordManager.
 *
 * Body: { encryptedContent: string (base64), fileName: string }
 */
recordsRouter.post(
  "/upload",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { encryptedContent, fileName } = req.body;

      if (!encryptedContent || !fileName) {
        res.status(400).json({ error: "Missing encryptedContent or fileName" });
        return;
      }

      const buffer = Buffer.from(encryptedContent, "base64");
      const result = await pinToIPFS(buffer, fileName);

      res.json({
        success: true,
        cid: result.IpfsHash,
        size: result.PinSize,
        timestamp: result.Timestamp,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/records/fetch/:cid
 * Fetches encrypted content from IPFS and returns it as base64.
 * The frontend decrypts client-side.
 */
recordsRouter.get(
  "/fetch/:cid",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { cid } = req.params;
      if (!cid) {
        res.status(400).json({ error: "Missing CID parameter" });
        return;
      }

      const encrypted = await fetchFromIPFS(cid);
      res.json({
        success: true,
        cid,
        encryptedContent: encrypted.toString("base64"),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/records/unpin/:cid
 * Unpins content from IPFS (triggered on record deletion).
 */
recordsRouter.delete(
  "/unpin/:cid",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { cid } = req.params;
      if (!cid) {
        res.status(400).json({ error: "Missing CID parameter" });
        return;
      }

      await unpinFromIPFS(cid);
      res.json({ success: true, cid });
    } catch (err) {
      next(err);
    }
  }
);
