import { Router, type Request, type Response, type NextFunction } from "express";
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
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
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

// PUT /api/merchants/:id
router.put(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
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
