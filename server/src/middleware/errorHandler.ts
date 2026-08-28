import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppCustomError } from "../services/negotiationService.js";

export class AppError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof AppCustomError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  if (err instanceof ZodError) {
    const message = err.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    return res.status(400).json({
      success: false,
      message: `Validation Error: ${message}`,
    });
  }

  // Handle Mongoose duplicate key error
  if (err.name === "MongoServerError" && err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    return res.status(409).json({
      success: false,
      message: `A record with that ${field} already exists.`,
    });
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid ID format for ${err.path}`,
    });
  }

  // Handle Mongoose ValidationError
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  console.error("Unhandled Error:", err);
  return res.status(500).json({
    success: false,
    message: err.message || "Internal server error",
  });
};
