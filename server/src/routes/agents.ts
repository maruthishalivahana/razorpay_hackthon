import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { runBuyerAgent } from "../agents/buyerAgent.js";

import { optionalAuth } from "../middleware/auth.js";
import { getConversation } from "../services/conversationService.js";
import { AppCustomError } from "../services/negotiationService.js";
import mongoose from "mongoose";

const router = Router();

const chatActionSchema = z.object({
  type: z.enum([
    "ACCEPT_NEGOTIATION",
    "CONTINUE_NEGOTIATION",
    "PLACE_ORDER",
    "VIEW_ORDER_STATUS",
    "PAY_NOW",
    "VIEW_PRODUCT",
    "VIEW_DETAILS",
    "MAKE_OFFER",
  ]),
  negotiationId: z.string().optional(),
  agreementId: z.string().optional(),
  productId: z.string().optional(),
});

const buyerChatSchema = z
  .object({
    conversationId: z.string().optional(),
    message: z.string().optional(),
    action: chatActionSchema.optional(),
    /** Legacy field — kept for backward compatibility with old test payloads */
    conversation: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })
      )
      .optional(),
  })
  .refine((data) => Boolean(data.message || data.action), {
    message: "Either message or action is required",
  });

// POST /api/agents/buyer/chat
router.post(
  "/buyer/chat",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId, message, action, conversation } = buyerChatSchema.parse(
        req.body
      );

      // Verify conversation ownership if conversationId provided and user is authenticated buyer
      if (conversationId && req.user?.buyerId) {
        const existingConv = await getConversation(conversationId);
        if (existingConv) {
          if (existingConv.buyerId) {
            if (existingConv.buyerId.toString() !== req.user.buyerId) {
              throw new AppCustomError("FORBIDDEN", "You don't have permission to access this conversation.", 403);
            }
          } else {
            // Associate unassigned conversation with current authenticated buyer
            existingConv.buyerId = new mongoose.Types.ObjectId(req.user.buyerId);
            await existingConv.save();
          }
        }
      }

      const result = await runBuyerAgent({
        message,
        action,
        conversationId,
        conversationContext: conversation,
      });

      // If new conversation created by authenticated buyer, ensure buyerId is attached
      if (result.conversationId && req.user?.buyerId) {
        const newConv = await getConversation(result.conversationId);
        if (newConv && !newConv.buyerId) {
          newConv.buyerId = new mongoose.Types.ObjectId(req.user.buyerId);
          await newConv.save();
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          conversationId: result.conversationId,
          message: result.message,
          products: result.products,
          selectedProduct: result.selectedProduct,
          searchState: result.searchState,
          actions: result.actions || [],
          ...(result.commerceQuery ? { commerceQuery: result.commerceQuery } : {}),
          ...(result.nextAction ? { nextAction: result.nextAction } : {}),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
