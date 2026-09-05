import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  createMerchantSchema,
  updateMerchantSchema,
} from "../utils/validation.js";
import {
  createMerchant,
  getAllMerchants,
  getMerchantById,
  updateMerchant,
  deleteMerchant,
} from "../services/merchantService.js";

import { requireAuth, requireRole, optionalAuth } from "../middleware/auth.js";
import { AppCustomError } from "../services/negotiationService.js";

const router = Router();

// POST /api/merchants
router.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = createMerchantSchema.parse(req.body);
      const merchant = await createMerchant(validatedData);
      return res.status(201).json({
        success: true,
        data: merchant,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/merchants
router.get(
  "/",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role === "MERCHANT" && req.user.merchantId) {
        const merchant = await getMerchantById(req.user.merchantId);
        return res.status(200).json({
          success: true,
          data: [merchant],
        });
      }

      const merchants = await getAllMerchants();
      return res.status(200).json({
        success: true,
        data: merchants,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/merchants/:id
router.get(
  "/:id",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      if (req.user?.role === "MERCHANT" && req.user.merchantId) {
        if (id !== req.user.merchantId) {
          throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
        }
      }

      const merchant = await getMerchantById(id);
      return res.status(200).json({
        success: true,
        data: merchant,
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/merchants/:id (Requires MERCHANT role & merchant ownership)
router.put(
  "/:id",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      if (id !== req.user!.merchantId) {
        throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
      }

      const validatedData = updateMerchantSchema.parse(req.body);
      const updatedMerchant = await updateMerchant(id, validatedData);
      return res.status(200).json({
        success: true,
        data: updatedMerchant,
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/merchants/:id
router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const deletedMerchant = await deleteMerchant(id);
      return res.status(200).json({
        success: true,
        message: "Merchant deleted successfully",
        data: deletedMerchant,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
