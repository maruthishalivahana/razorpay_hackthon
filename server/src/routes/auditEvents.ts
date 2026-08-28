import { Router, type Request, type Response, type NextFunction } from "express";
import {
  getAuditEventsForAgreement,
  getAuditEventsForNegotiation,
} from "../services/auditService.js";

const router = Router();

// GET /api/audit-events/agreement/:agreementId
router.get(
  "/agreement/:agreementId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agreementId = String(req.params.agreementId);
      const auditTrail = await getAuditEventsForAgreement(agreementId);
      return res.status(200).json({
        success: true,
        data: auditTrail,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/audit-events/negotiation/:negotiationId
router.get(
  "/negotiation/:negotiationId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const negotiationId = String(req.params.negotiationId);
      const auditTrail = await getAuditEventsForNegotiation(negotiationId);
      return res.status(200).json({
        success: true,
        data: auditTrail,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
