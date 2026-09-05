import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  getAuditEventsForAgreement,
  getAuditEventsForNegotiation,
  getMerchantAuditEvents,
} from "../services/auditService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(403).json({ success: false, message: "Merchant account is required." });
      }
      const result = await getMerchantAuditEvents({
        merchantId: req.user.merchantId,
        eventType: req.query.eventType ? String(req.query.eventType) : undefined,
        category: req.query.category ? String(req.query.category) : undefined,
        productId: req.query.productId ? String(req.query.productId) : undefined,
        negotiationId: req.query.negotiationId ? String(req.query.negotiationId) : undefined,
        agreementId: req.query.agreementId ? String(req.query.agreementId) : undefined,
        orderId: req.query.orderId ? String(req.query.orderId) : undefined,
        paymentId: req.query.paymentId ? String(req.query.paymentId) : undefined,
        dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : undefined,
        dateTo: req.query.dateTo ? String(req.query.dateTo) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        page: req.query.page ? String(req.query.page) : undefined,
        pageSize: req.query.pageSize ? String(req.query.pageSize) : undefined,
      });
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/audit-events/agreement/:agreementId
router.get(
  "/agreement/:agreementId",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agreementId = String(req.params.agreementId);
      const auditTrail = await getAuditEventsForAgreement(agreementId, req.user?.merchantId || undefined);
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
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const negotiationId = String(req.params.negotiationId);
      const auditTrail = await getAuditEventsForNegotiation(negotiationId, req.user?.merchantId || undefined);
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
