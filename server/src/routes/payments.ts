import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  createPaymentOrder,
  verifyPayment,
  getPaymentStatus,
} from "../services/paymentService.js";
import { optionalAuth } from "../middleware/auth.js";
import { getAgreementById } from "../services/agreementService.js";
import { AppCustomError } from "../services/negotiationService.js";

const router = Router();

// POST /api/payments/create-order
router.post(
  "/create-order",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { agreementId } = req.body;
      if (!agreementId) {
        throw new AppCustomError("INVALID_INPUT", "agreementId is required", 400);
      }

      const agreement = await getAgreementById(agreementId);
      if (req.user?.role === "MERCHANT" && req.user.merchantId) {
        const merchantIdStr = agreement.merchantId?._id ? agreement.merchantId._id.toString() : agreement.merchantId?.toString();
        if (merchantIdStr !== req.user.merchantId) {
          throw new AppCustomError("FORBIDDEN", "You don't have permission to access this agreement.", 403);
        }
      }

      const result = await createPaymentOrder(agreementId);
      res.status(200).json(result);
    } catch (err: any) {
      next(err);
    }
  }
);

// POST /api/payments/verify
router.post(
  "/verify",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { agreementId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;
      if (!agreementId) {
        throw new AppCustomError("INVALID_INPUT", "agreementId is required", 400);
      }

      const agreement = await getAgreementById(agreementId);
      if (req.user?.role === "MERCHANT" && req.user.merchantId) {
        const merchantIdStr = agreement.merchantId?._id ? agreement.merchantId._id.toString() : agreement.merchantId?.toString();
        if (merchantIdStr !== req.user.merchantId) {
          throw new AppCustomError("FORBIDDEN", "You don't have permission to access this agreement.", 403);
        }
      }

      const result = await verifyPayment({
        agreementId,
        razorpayPaymentId,
        razorpayOrderId,
        razorpaySignature,
      });
      res.status(200).json(result);
    } catch (err: any) {
      next(err);
    }
  }
);

// GET /api/payments/agreement/:agreementId
router.get(
  "/agreement/:agreementId",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const agreementId = String(req.params.agreementId);
      const agreement = await getAgreementById(agreementId);
      if (req.user?.role === "MERCHANT" && req.user.merchantId) {
        const merchantIdStr = agreement.merchantId?._id ? agreement.merchantId._id.toString() : agreement.merchantId?.toString();
        if (merchantIdStr !== req.user.merchantId) {
          throw new AppCustomError("FORBIDDEN", "You don't have permission to access this agreement.", 403);
        }
      }

      const status = await getPaymentStatus(agreementId);
      res.status(200).json({ success: true, data: status });
    } catch (err: any) {
      next(err);
    }
  }
);

export default router;
