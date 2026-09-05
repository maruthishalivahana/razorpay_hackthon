import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  approveAgreementSchema,
  rejectAgreementSchema,
} from "../utils/validation.js";
import {
  getApprovalById,
  getApprovalByAgreement,
} from "../services/approvalService.js";
import {
  approveAgreement,
  rejectAgreement,
} from "../services/agreementService.js";

import { requireAuth, requireRole, optionalAuth } from "../middleware/auth.js";
import { AppCustomError } from "../services/negotiationService.js";

const router = Router();

// GET /api/approvals/agreement/:agreementId (MUST BE BEFORE /:id)
router.get(
  "/agreement/:agreementId",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agreementId = String(req.params.agreementId);
      const approval = await getApprovalByAgreement(agreementId);

      if (approval && req.user?.role === "MERCHANT" && req.user.merchantId) {
        if (approval.merchantId.toString() !== req.user.merchantId) {
          throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
        }
      }

      return res.status(200).json({
        success: true,
        data: approval,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/approvals/:id
router.get(
  "/:id",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const approval = await getApprovalById(id);

      if (approval && req.user?.role === "MERCHANT" && req.user.merchantId) {
        if (approval.merchantId.toString() !== req.user.merchantId) {
          throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
        }
      }

      return res.status(200).json({
        success: true,
        data: approval,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/approvals/:id/approve (Requires MERCHANT role & approval ownership)
router.post(
  "/:id/approve",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const { reviewer } = approveAgreementSchema.parse(req.body);

      const approval = await getApprovalById(id);
      if (approval.merchantId.toString() !== req.user!.merchantId) {
        throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
      }

      const result = await approveAgreement(
        approval.agreementId.toString(),
        reviewer
      );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/approvals/:id/reject (Requires MERCHANT role & approval ownership)
router.post(
  "/:id/reject",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const { reviewer, reason } = rejectAgreementSchema.parse(req.body);

      const approval = await getApprovalById(id);
      if (approval.merchantId.toString() !== req.user!.merchantId) {
        throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
      }

      const result = await rejectAgreement(
        approval.agreementId.toString(),
        reviewer,
        reason
      );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
