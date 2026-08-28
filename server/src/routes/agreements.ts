import { Router, type Request, type Response, type NextFunction } from "express";
import {
  createAgreementFromNegotiation,
  getAgreementById,
  getAgreementExplanation,
  isPaymentReady,
} from "../services/agreementService.js";
import { getAuditEventsForAgreement } from "../services/auditService.js";

const router = Router();

// POST /api/agreements/from-negotiation/:negotiationId
router.post(
  "/from-negotiation/:negotiationId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const negotiationId = String(req.params.negotiationId);
      const agreement = await createAgreementFromNegotiation(negotiationId);
      return res.status(201).json({
        success: true,
        data: agreement,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/agreements/:id/explanation (MUST BE BEFORE /:id)
router.get(
  "/:id/explanation",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const explanation = await getAgreementExplanation(id);
      return res.status(200).json({
        success: true,
        data: explanation,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/agreements/:id/payment-ready (MUST BE BEFORE /:id)
router.get(
  "/:id/payment-ready",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await isPaymentReady(id);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/agreements/:id/audit (MUST BE BEFORE /:id)
router.get(
  "/:id/audit",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const auditTrail = await getAuditEventsForAgreement(id);
      return res.status(200).json({
        success: true,
        data: auditTrail,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/agreements/:id
router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const agreement = await getAgreementById(id);
      return res.status(200).json({
        success: true,
        data: agreement,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
