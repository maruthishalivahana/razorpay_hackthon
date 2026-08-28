import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { runBuyerAgent } from "../agents/buyerAgent.js";

const router = Router();

const buyerChatSchema = z.object({
  message: z.string().min(1, "Message text is required"),
  conversation: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
});

// POST /api/agents/buyer/chat
router.post(
  "/buyer/chat",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message, conversation } = buyerChatSchema.parse(req.body);
      const result = await runBuyerAgent(message, conversation || []);

      return res.status(200).json({
        success: true,
        data: {
          message: result.message,
          products: result.products,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
