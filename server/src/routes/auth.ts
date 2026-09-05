import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  registerBuyer,
  registerMerchant,
  loginUser,
  getUserProfile,
} from "../services/authService.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as any,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

// POST /api/auth/register/buyer
router.post(
  "/register/buyer",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await registerBuyer(req.body);
      res.cookie("token", result.token, getCookieOptions());
      res.status(201).json({
        success: true,
        message: "Buyer registered successfully.",
        data: result.user,
      });
    } catch (err: any) {
      next(err);
    }
  }
);

// POST /api/auth/register/merchant
router.post(
  "/register/merchant",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await registerMerchant(req.body);
      res.cookie("token", result.token, getCookieOptions());
      res.status(201).json({
        success: true,
        message: "Merchant registered successfully.",
        data: result.user,
      });
    } catch (err: any) {
      next(err);
    }
  }
);

// POST /api/auth/login
router.post(
  "/login",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await loginUser(req.body);
      res.cookie("token", result.token, getCookieOptions());
      res.status(200).json({
        success: true,
        message: "Logged in successfully.",
        data: result.user,
      });
    } catch (err: any) {
      next(err);
    }
  }
);

// POST /api/auth/logout
router.post(
  "/logout",
  (_req: Request, res: Response): void => {
    res.clearCookie("token", { path: "/" });
    res.clearCookie("auth_token", { path: "/" });
    res.status(200).json({
      success: true,
      message: "Logged out successfully.",
    });
  }
);

// GET /api/auth/me
router.get(
  "/me",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthenticated" });
        return;
      }
      const profile = await getUserProfile(req.user.userId);
      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (err: any) {
      next(err);
    }
  }
);

export default router;
