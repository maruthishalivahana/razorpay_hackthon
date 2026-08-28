import mongoose, { Schema, Document } from "mongoose";

export type AgreementStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "COMPLETED";

export interface IAgreement extends Document {
  negotiationId: mongoose.Types.ObjectId;
  merchantId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  policyId: mongoose.Types.ObjectId;
  status: AgreementStatus;
  quantity: number;
  currency: string;
  originalUnitPrice: number;
  agreedUnitPrice: number;
  discountPercent: number;
  finalOrderValue: number;
  marginPercent: number;
  expiresAt?: Date;
  approvedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const agreementSchema = new Schema<IAgreement>(
  {
    negotiationId: {
      type: Schema.Types.ObjectId,
      ref: "Negotiation",
      required: true,
      unique: true,
    },
    merchantId: {
      type: Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    policyId: {
      type: Schema.Types.ObjectId,
      ref: "Policy",
      required: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "EXPIRED", "COMPLETED"],
      required: true,
      default: "DRAFT",
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
      validate: {
        validator: Number.isInteger,
        message: "Quantity must be an integer",
      },
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    originalUnitPrice: {
      type: Number,
      required: true,
      min: [0.01, "Original unit price must be greater than 0"],
    },
    agreedUnitPrice: {
      type: Number,
      required: true,
      min: [0.01, "Agreed unit price must be greater than 0"],
    },
    discountPercent: {
      type: Number,
      required: true,
      min: [0, "Discount percent cannot be negative"],
      max: [100, "Discount percent cannot exceed 100"],
    },
    finalOrderValue: {
      type: Number,
      required: true,
      min: [0, "Final order value cannot be negative"],
    },
    marginPercent: {
      type: Number,
      required: true,
    },
    expiresAt: {
      type: Date,
    },
    approvedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
agreementSchema.index({ merchantId: 1 });
agreementSchema.index({ status: 1 });
agreementSchema.index({ createdAt: -1 });

const Agreement = mongoose.model<IAgreement>("Agreement", agreementSchema);

export default Agreement;
