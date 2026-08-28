import { Router, type Request, type Response, type NextFunction } from "express";
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

const router = Router();

// POST /api/policies
router.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = createPolicySchema.parse(req.body);
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { merchantId, isActive, page, limit } = req.query;
      const result = await getAllPolicies({
        merchantId: merchantId ? String(merchantId) : undefined,
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

// GET /api/policies/merchant/:merchantId (Registered BEFORE /:id)
router.get(
  "/merchant/:merchantId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const merchantId = String(req.params.merchantId);
      const policy = await getPolicyByMerchantId(merchantId);
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const policy = await getPolicyById(id);
      return res.status(200).json({
        success: true,
        data: policy,
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/policies/:id
router.put(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
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

// DELETE /api/policies/:id
router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
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
