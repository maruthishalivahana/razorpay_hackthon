import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  createAgreementFromNegotiation,
  getAgreementById,
  getAllAgreements,
  getAgreementExplanation,
  isPaymentReady,
  approveAgreement,
  rejectAgreement,
} from "../services/agreementService.js";
import { getAuditEventsForAgreement } from "../services/auditService.js";
import {
  approveAgreementSchema,
  rejectAgreementSchema,
} from "../utils/validation.js";

import { requireAuth, requireRole, optionalAuth } from "../middleware/auth.js";
import { AppCustomError } from "../services/negotiationService.js";

const router = Router();

// POST /api/agreements/from-negotiation/:negotiationId
router.post(
  "/from-negotiation/:negotiationId",
  optionalAuth,
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

// GET /api/agreements - List agreements with filtering and pagination
router.get(
  "/",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { merchantId: queryMerchantId, status, search, page, limit } = req.query;

      const effectiveMerchantId =
        req.user?.role === "MERCHANT" && req.user.merchantId
          ? req.user.merchantId
          : queryMerchantId ? String(queryMerchantId) : undefined;

      const result = await getAllAgreements({
        merchantId: effectiveMerchantId,
        status: status ? String(status) : undefined,
        search: search ? String(search) : undefined,
        page: page ? String(page) : undefined,
        limit: limit ? String(limit) : undefined,
      });

      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/agreements/:id/explanation (MUST BE BEFORE /:id)
router.get(
  "/:id/explanation",
  optionalAuth,
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
  optionalAuth,
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
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const auditTrail = await getAuditEventsForAgreement(id, req.user?.merchantId || undefined);
      return res.status(200).json({
        success: true,
        data: auditTrail,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/agreements/:id/approve (Requires MERCHANT role & agreement ownership)
router.post(
  "/:id/approve",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const agreement = await getAgreementById(id);
      const merchantIdStr = agreement.merchantId?._id ? agreement.merchantId._id.toString() : agreement.merchantId?.toString();

      if (merchantIdStr !== req.user!.merchantId) {
        throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
      }

      const { reviewer } = approveAgreementSchema.parse(req.body);
      const result = await approveAgreement(id, reviewer);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/agreements/:id/reject (Requires MERCHANT role & agreement ownership)
router.post(
  "/:id/reject",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const agreement = await getAgreementById(id);
      const merchantIdStr = agreement.merchantId?._id ? agreement.merchantId._id.toString() : agreement.merchantId?.toString();

      if (merchantIdStr !== req.user!.merchantId) {
        throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
      }

      const { reviewer, reason } = rejectAgreementSchema.parse(req.body);
      const result = await rejectAgreement(id, reviewer, reason);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/agreements/:id
router.get(
  "/:id",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const agreement = await getAgreementById(id);

      if (req.user?.role === "MERCHANT" && req.user.merchantId) {
        const merchantIdStr = agreement.merchantId?._id ? agreement.merchantId._id.toString() : agreement.merchantId?.toString();
        if (merchantIdStr !== req.user.merchantId) {
          throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
        }
      }

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
