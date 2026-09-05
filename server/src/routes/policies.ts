import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  createPolicySchema,
  updatePolicySchema,
} from "../utils/validation.js";
import {
  createPolicy,
  getPolicyByMerchantId,
  getPolicyById,
  getAllPolicies,
  updatePolicy,
  deletePolicy,
} from "../services/policyService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppCustomError } from "../services/negotiationService.js";

const router = Router();

// POST /api/policies (Requires MERCHANT role)
router.post(
  "/",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const merchantId = req.user!.merchantId;
      if (!merchantId) {
        throw new AppCustomError("FORBIDDEN", "Merchant account is required.", 403);
      }
      const validatedData = createPolicySchema.parse({
        ...req.body,
        merchantId,
      });
      const policy = await createPolicy(validatedData as any);
      return res.status(201).json({
        success: true,
        data: policy,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/policies
router.get(
  "/",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { merchantId: queryMerchantId, isActive, page, limit } = req.query;
      const effectiveMerchantId =
        req.user?.role === "MERCHANT" && req.user.merchantId
          ? req.user.merchantId
          : queryMerchantId ? String(queryMerchantId) : undefined;

      const result = await getAllPolicies({
        merchantId: effectiveMerchantId,
        isActive: isActive !== undefined ? String(isActive) : undefined,
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

// GET /api/policies/me
router.get(
  "/me",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const merchantId = req.user!.merchantId;
      if (!merchantId) {
        throw new AppCustomError("FORBIDDEN", "Merchant account is required.", 403);
      }

      const policy = await getPolicyByMerchantId(merchantId);
      return res.status(200).json({ success: true, data: policy });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/policies/merchant/:merchantId (Registered BEFORE /:id)
router.get(
  "/merchant/:merchantId",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestedMerchantId = String(req.params.merchantId);
      if (req.user?.role === "MERCHANT" && req.user.merchantId) {
        if (requestedMerchantId !== req.user.merchantId) {
          throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
        }
      }

      const policy = await getPolicyByMerchantId(requestedMerchantId);
      return res.status(200).json({
        success: true,
        data: policy,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/policies/:id
router.get(
  "/:id",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const policy = await getPolicyById(id);

      if (req.user?.role === "MERCHANT" && req.user.merchantId) {
        if (policy.merchantId.toString() !== req.user.merchantId) {
          throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
        }
      }

      return res.status(200).json({
        success: true,
        data: policy,
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/policies/:id (Requires MERCHANT role & policy ownership)
router.put(
  "/:id",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const existingPolicy = await getPolicyById(id);

      if (existingPolicy.merchantId.toString() !== req.user!.merchantId) {
        throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
      }

      const validatedData = updatePolicySchema.parse(req.body);
      const updatedPolicy = await updatePolicy(id, validatedData as any);
      return res.status(200).json({
        success: true,
        data: updatedPolicy,
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/policies/:id (Requires MERCHANT role & policy ownership)
router.delete(
  "/:id",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const existingPolicy = await getPolicyById(id);

      if (existingPolicy.merchantId.toString() !== req.user!.merchantId) {
        throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
      }

      const deletedPolicy = await deletePolicy(id);
      return res.status(200).json({
        success: true,
        message: "Policy deleted successfully",
        data: deletedPolicy,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
