import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  createProductSchema,
  updateProductSchema,
} from "../utils/validation.js";
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  searchProducts,
} from "../services/productService.js";
import { requireAuth, requireRole, optionalAuth } from "../middleware/auth.js";
import { AppCustomError } from "../services/negotiationService.js";

const router = Router();

// POST /api/products (Requires MERCHANT role)
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
      const rawImageUrl = req.body.imageUrl ?? req.body.image;
      const normalizedImageUrl =
        typeof rawImageUrl === "string" ? rawImageUrl.trim() : rawImageUrl;

      const validatedData = createProductSchema.parse({
        ...req.body,
        imageUrl: normalizedImageUrl || undefined,
        merchantId,
      });
      const product = await createProduct(validatedData as any);
      return res.status(201).json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/products/search (MUST BE BEFORE /:id)
router.get(
  "/search",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        query,
        category,
        minPrice,
        maxPrice,
        minInventory,
        merchantId: queryMerchantId,
        limit,
        sortBy,
      } = req.query;

      const parsedMinPrice = minPrice !== undefined ? Number(minPrice) : undefined;
      const parsedMaxPrice = maxPrice !== undefined ? Number(maxPrice) : undefined;
      const parsedMinInventory = minInventory !== undefined ? Number(minInventory) : undefined;
      const parsedLimit = limit !== undefined ? Number(limit) : undefined;

      const effectiveMerchantId =
        req.user?.role === "MERCHANT" && req.user.merchantId
          ? req.user.merchantId
          : queryMerchantId ? String(queryMerchantId) : undefined;

      const result = await searchProducts({
        query: query ? String(query) : undefined,
        category: category ? String(category) : undefined,
        minPrice: parsedMinPrice,
        maxPrice: parsedMaxPrice,
        minInventory: parsedMinInventory,
        merchantId: effectiveMerchantId,
        limit: parsedLimit,
        sortBy: sortBy as any,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/products
router.get(
  "/",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { merchantId: queryMerchantId, category, status, search, page, limit } = req.query;

      const effectiveMerchantId =
        req.user?.role === "MERCHANT" && req.user.merchantId
          ? req.user.merchantId
          : queryMerchantId ? String(queryMerchantId) : undefined;

      const result = await getProducts({
        merchantId: effectiveMerchantId,
        category: category ? String(category) : undefined,
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

// GET /api/products/:id
router.get(
  "/:id",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const product = await getProductById(id);
      const productMerchantId =
        typeof product.merchantId === "object" && product.merchantId !== null
          ? product.merchantId._id?.toString?.() ?? product.merchantId.toString()
          : product.merchantId.toString();

      if (req.user?.role === "MERCHANT" && req.user.merchantId) {
        if (productMerchantId !== req.user.merchantId) {
          throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
        }
      }

      return res.status(200).json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/products/:id (Requires MERCHANT role & product ownership)
router.put(
  "/:id",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const existingProduct = await getProductById(id);

      const existingMerchantId =
        typeof existingProduct.merchantId === "object" && existingProduct.merchantId !== null
          ? existingProduct.merchantId._id?.toString?.() ?? existingProduct.merchantId.toString()
          : existingProduct.merchantId.toString();

      if (existingMerchantId !== req.user!.merchantId) {
        throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
      }

      const { merchantId: _ignoredMerchantId, ...safeBody } = req.body ?? {};

      if (safeBody.image !== undefined && safeBody.imageUrl === undefined) {
        safeBody.imageUrl = safeBody.image;
      }
      if (typeof safeBody.imageUrl === "string") {
        safeBody.imageUrl = safeBody.imageUrl.trim();
      }

      const validatedData = updateProductSchema.parse(safeBody);
      const updatedProduct = await updateProduct(id, {
        ...validatedData,
        merchantId: req.user!.merchantId,
      } as any);
      return res.status(200).json({
        success: true,
        data: updatedProduct,
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/products/:id (Requires MERCHANT role & product ownership)
router.delete(
  "/:id",
  requireAuth,
  requireRole("MERCHANT"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const existingProduct = await getProductById(id);
      const existingMerchantId =
        typeof existingProduct.merchantId === "object" && existingProduct.merchantId !== null
          ? existingProduct.merchantId._id?.toString?.() ?? existingProduct.merchantId.toString()
          : existingProduct.merchantId.toString();

      if (existingMerchantId !== req.user!.merchantId) {
        throw new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403);
      }

      const deletedProduct = await deleteProduct(id);
      return res.status(200).json({
        success: true,
        message: "Product deleted successfully",
        data: deletedProduct,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
