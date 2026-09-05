import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/authService.js";
import { AppCustomError } from "../services/negotiationService.js";
import type { UserRole } from "../models/User.js";

export interface AuthenticatedUserPayload {
  userId: string;
  email: string;
  role: UserRole;
  merchantId: string | null;
  buyerId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUserPayload;
    }
  }
}

export const extractTokenFromRequest = (req: Request): string | null => {
  // 1. Try HTTP-only cookies
  if (req.cookies) {
    if (req.cookies.token) return req.cookies.token;
    if (req.cookies.auth_token) return req.cookies.auth_token;
  }

  // 2. Try Authorization header (Bearer <token>)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1].trim();
  }

  return null;
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const token = extractTokenFromRequest(req);
    if (!token) {
      throw new AppCustomError("UNAUTHORIZED", "Authentication required.", 401);
    }

    const decoded = verifyToken(token);
    req.user = {
      userId: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      merchantId: decoded.merchantId || null,
      buyerId: decoded.buyerId || null,
    };

    next();
  } catch (err: any) {
    next(err);
  }
};

export const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const token = extractTokenFromRequest(req);
    if (token) {
      const decoded = verifyToken(token);
      req.user = {
        userId: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        merchantId: decoded.merchantId || null,
        buyerId: decoded.buyerId || null,
      };
    }
  } catch {
    // Ignore invalid token for optional auth
  }
  next();
};

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppCustomError("UNAUTHORIZED", "Authentication required.", 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppCustomError("FORBIDDEN", "You don't have permission to access this resource.", 403)
      );
    }

    next();
  };
};
