import { z } from "zod";
import mongoose from "mongoose";

export const objectIdSchema = z.string().refine(
  (val) => mongoose.Types.ObjectId.isValid(val),
  { message: "Invalid MongoDB ObjectId" }
);

export const createMerchantSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters"),
  businessName: z
    .string()
    .min(1, "Business name is required")
    .max(150, "Business name cannot exceed 150 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  description: z
    .string()
    .max(500, "Description cannot exceed 500 characters")
    .optional(),
  currency: z.string().optional(),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
  agentEnabled: z.boolean().optional(),
  agentDescription: z
    .string()
    .max(500, "Agent description cannot exceed 500 characters")
    .optional(),
});

export const updateMerchantSchema = createMerchantSchema.partial();

export const imageUrlSchema = z
  .string()
  .trim()
  .refine(
    (val) => {
      if (!val) return true;
      try {
        const parsed = new URL(val);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Image URL must be a valid HTTP or HTTPS URL" }
  )
  .optional()
  .nullable();

export const createProductSchema = z.object({
  merchantId: objectIdSchema,
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(150, "Name cannot exceed 150 characters"),
  description: z
    .string()
    .min(1, "Description is required")
    .max(1000, "Description cannot exceed 1000 characters"),
  category: z
    .string()
    .min(1, "Category is required")
    .max(100, "Category cannot exceed 100 characters"),
  sku: z.string().min(1, "SKU is required"),
  price: z.number().positive("Price must be greater than 0"),
  costPrice: z.number().positive("Cost price must be greater than 0"),
  currency: z.string().optional(),
  inventory: z
    .number()
    .int("Inventory must be an integer")
    .min(0, "Inventory cannot be negative")
    .optional(),
  lowStockThreshold: z
    .number()
    .int("Low stock threshold must be an integer")
    .min(0, "Low stock threshold cannot be negative")
    .optional(),
  status: z.enum(["active", "inactive", "out_of_stock"]).optional(),
  deliveryDays: z
    .number()
    .int("Delivery days must be an integer")
    .min(0, "Delivery days cannot be negative")
    .optional(),
  tags: z.array(z.string()).optional(),
  imageUrl: imageUrlSchema,
  image: imageUrlSchema,
  isNegotiable: z.boolean().optional(),
  specifications: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const createPolicySchema = z
  .object({
    merchantId: objectIdSchema,
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name cannot exceed 100 characters"),
    description: z
      .string()
      .max(500, "Description cannot exceed 500 characters")
      .optional(),
    isActive: z.boolean().optional(),
    negotiationEnabled: z.boolean().optional(),
    maxDiscountPercent: z
      .number()
      .min(0, "maxDiscountPercent cannot be negative")
      .max(100, "maxDiscountPercent cannot exceed 100")
      .optional(),
    minMarginPercent: z
      .number()
      .min(0, "minMarginPercent cannot be negative")
      .max(100, "minMarginPercent cannot exceed 100")
      .optional(),
    maxQuantityPerOrder: z
      .number()
      .int("maxQuantityPerOrder must be an integer")
      .min(1, "maxQuantityPerOrder must be at least 1")
      .optional(),
    minOrderValue: z
      .number()
      .min(0, "minOrderValue cannot be negative")
      .optional(),
    maxOrderValue: z
      .number()
      .min(0, "maxOrderValue cannot be negative")
      .optional(),
    autoApprovalEnabled: z.boolean().optional(),
    autoApprovalLimit: z
      .number()
      .min(0, "autoApprovalLimit cannot be negative")
      .optional(),
    freeShippingThreshold: z
      .number()
      .min(0, "freeShippingThreshold cannot be negative")
      .optional(),
    maxNegotiationRounds: z
      .number()
      .int("maxNegotiationRounds must be an integer")
      .min(0, "maxNegotiationRounds cannot be negative")
      .max(20, "maxNegotiationRounds cannot exceed 20")
      .optional(),
    allowedCurrencies: z
      .array(z.string())
      .min(1, "allowedCurrencies must contain at least 1 currency")
      .optional(),
  })
  .refine(
    (data) => {
      const minVal = data.minOrderValue ?? 0;
      const maxVal = data.maxOrderValue ?? 100000;
      return maxVal >= minVal;
    },
    {
      message: "maxOrderValue cannot be lower than minOrderValue",
      path: ["maxOrderValue"],
    }
  )
  .refine(
    (data) => {
      const maxVal = data.maxOrderValue ?? 100000;
      const limit = data.autoApprovalLimit ?? 50000;
      return limit <= maxVal;
    },
    {
      message: "autoApprovalLimit cannot be greater than maxOrderValue",
      path: ["autoApprovalLimit"],
    }
  );

export const updatePolicySchema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name cannot exceed 100 characters")
      .optional(),
    description: z
      .string()
      .max(500, "Description cannot exceed 500 characters")
      .optional(),
    isActive: z.boolean().optional(),
    negotiationEnabled: z.boolean().optional(),
    maxDiscountPercent: z
      .number()
      .min(0, "maxDiscountPercent cannot be negative")
      .max(100, "maxDiscountPercent cannot exceed 100")
      .optional(),
    minMarginPercent: z
      .number()
      .min(0, "minMarginPercent cannot be negative")
      .max(100, "minMarginPercent cannot exceed 100")
      .optional(),
    maxQuantityPerOrder: z
      .number()
      .int("maxQuantityPerOrder must be an integer")
      .min(1, "maxQuantityPerOrder must be at least 1")
      .optional(),
    minOrderValue: z
      .number()
      .min(0, "minOrderValue cannot be negative")
      .optional(),
    maxOrderValue: z
      .number()
      .min(0, "maxOrderValue cannot be negative")
      .optional(),
    autoApprovalEnabled: z.boolean().optional(),
    autoApprovalLimit: z
      .number()
      .min(0, "autoApprovalLimit cannot be negative")
      .optional(),
    freeShippingThreshold: z
      .number()
      .min(0, "freeShippingThreshold cannot be negative")
      .optional(),
    maxNegotiationRounds: z
      .number()
      .int("maxNegotiationRounds must be an integer")
      .min(0, "maxNegotiationRounds cannot be negative")
      .max(20, "maxNegotiationRounds cannot exceed 20")
      .optional(),
    allowedCurrencies: z
      .array(z.string())
      .min(1, "allowedCurrencies must contain at least 1 currency")
      .optional(),
  })
  .refine(
    (data) => {
      if (data.maxOrderValue !== undefined && data.minOrderValue !== undefined) {
        return data.maxOrderValue >= data.minOrderValue;
      }
      return true;
    },
    {
      message: "maxOrderValue cannot be lower than minOrderValue",
      path: ["maxOrderValue"],
    }
  )
  .refine(
    (data) => {
      if (
        data.autoApprovalLimit !== undefined &&
        data.maxOrderValue !== undefined
      ) {
        return data.autoApprovalLimit <= data.maxOrderValue;
      }
      return true;
    },
    {
      message: "autoApprovalLimit cannot be greater than maxOrderValue",
      path: ["autoApprovalLimit"],
    }
  );

export const startNegotiationSchema = z.object({
  merchantId: objectIdSchema,
  productId: objectIdSchema,
  policyId: objectIdSchema,
  quantity: z
    .number()
    .int("Quantity must be an integer")
    .min(1, "Quantity must be at least 1"),
  currency: z.string().min(1, "Currency is required"),
});

export const submitBuyerOfferSchema = z.object({
  buyerOffer: z.number().positive("Buyer offer must be greater than 0"),
});

export const acceptNegotiationSchema = z.object({
  finalPrice: z.number().positive("Final price must be greater than 0"),
});

export const approveAgreementSchema = z.object({
  reviewer: z.string().min(1, "Reviewer identifier is required"),
});

export const rejectAgreementSchema = z.object({
  reviewer: z.string().min(1, "Reviewer identifier is required"),
  reason: z.string().optional(),
});

