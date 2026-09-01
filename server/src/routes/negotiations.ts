import { Router, type Request, type Response, type NextFunction } from "express";
import {
  startNegotiationSchema,
  submitBuyerOfferSchema,
  acceptNegotiationSchema,
} from "../utils/validation.js";
import {
  startNegotiation,
  getNegotiationById,
  getAllNegotiations,
  submitBuyerOffer,
  acceptNegotiation,
  rejectNegotiation,
} from "../services/negotiationService.js";

const router = Router();

// POST /api/negotiations - Start negotiation
router.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = startNegotiationSchema.parse(req.body);
      const negotiation = await startNegotiation(validatedData);
      return res.status(201).json({
        success: true,
        data: negotiation,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/negotiations - List negotiations with filters and pagination
router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { merchantId, status, search, page, limit } = req.query;
      const result = await getAllNegotiations({
        merchantId: merchantId ? String(merchantId) : undefined,
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

// GET /api/negotiations/:id - Get negotiation by ID
router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const negotiation = await getNegotiationById(id);
      return res.status(200).json({
        success: true,
        data: negotiation,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/negotiations/:id/offers - Submit buyer offer
router.post(
  "/:id/offers",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const { buyerOffer } = submitBuyerOfferSchema.parse(req.body);
      const result = await submitBuyerOffer(id, buyerOffer);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/negotiations/:id/accept - Accept negotiation
router.post(
  "/:id/accept",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const { finalPrice } = req.body && req.body.finalPrice ? acceptNegotiationSchema.parse(req.body) : { finalPrice: undefined };
      const negotiation = await acceptNegotiation(id, finalPrice);
      return res.status(200).json({
        success: true,
        data: negotiation,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/negotiations/:id/reject - Reject negotiation
router.post(
  "/:id/reject",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const negotiation = await rejectNegotiation(id);
      return res.status(200).json({
        success: true,
        data: negotiation,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
