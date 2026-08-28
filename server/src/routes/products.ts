import { Router, type Request, type Response, type NextFunction } from "express";
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

const router = Router();

// POST /api/products
router.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = createProductSchema.parse(req.body);
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        query,
        category,
        minPrice,
        maxPrice,
        minInventory,
        merchantId,
        limit,
        sortBy,
      } = req.query;

      const parsedMinPrice = minPrice !== undefined ? Number(minPrice) : undefined;
      const parsedMaxPrice = maxPrice !== undefined ? Number(maxPrice) : undefined;
      const parsedMinInventory = minInventory !== undefined ? Number(minInventory) : undefined;
      const parsedLimit = limit !== undefined ? Number(limit) : undefined;

      const result = await searchProducts({
        query: query ? String(query) : undefined,
        category: category ? String(category) : undefined,
        minPrice: parsedMinPrice,
        maxPrice: parsedMaxPrice,
        minInventory: parsedMinInventory,
        merchantId: merchantId ? String(merchantId) : undefined,
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { merchantId, category, status, search, page, limit } = req.query;
      const result = await getProducts({
        merchantId: merchantId ? String(merchantId) : undefined,
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const product = await getProductById(id);
      return res.status(200).json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/products/:id
router.put(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const validatedData = updateProductSchema.parse(req.body);
      const updatedProduct = await updateProduct(id, validatedData as any);
      return res.status(200).json({
        success: true,
        data: updatedProduct,
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/products/:id
router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
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
