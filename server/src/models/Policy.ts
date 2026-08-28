import mongoose, { Schema, Document } from "mongoose";

export interface IPolicy extends Document {
  merchantId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  isActive: boolean;
  negotiationEnabled: boolean;
  maxDiscountPercent: number;
  minMarginPercent: number;
  maxQuantityPerOrder: number;
  minOrderValue: number;
  maxOrderValue: number;
  autoApprovalEnabled: boolean;
  autoApprovalLimit: number;
  freeShippingThreshold: number;
  maxNegotiationRounds: number;
  allowedCurrencies: string[];
  createdAt: Date;
  updatedAt: Date;
}

const policySchema = new Schema<IPolicy>(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    negotiationEnabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    maxDiscountPercent: {
      type: Number,
      required: true,
      min: [0, "maxDiscountPercent cannot be negative"],
      max: [100, "maxDiscountPercent cannot exceed 100"],
      default: 10,
    },
    minMarginPercent: {
      type: Number,
      required: true,
      min: [0, "minMarginPercent cannot be negative"],
      max: [100, "minMarginPercent cannot exceed 100"],
      default: 20,
    },
    maxQuantityPerOrder: {
      type: Number,
      required: true,
      min: [1, "maxQuantityPerOrder must be at least 1"],
      default: 50,
      validate: {
        validator: Number.isInteger,
        message: "maxQuantityPerOrder must be an integer",
      },
    },
    minOrderValue: {
      type: Number,
      required: true,
      min: [0, "minOrderValue cannot be negative"],
      default: 0,
    },
    maxOrderValue: {
      type: Number,
      required: true,
      min: [0, "maxOrderValue cannot be negative"],
      default: 100000,
      validate: {
        validator: function (this: any, v: number) {
          return this.minOrderValue === undefined || v >= this.minOrderValue;
        },
        message: "maxOrderValue cannot be less than minOrderValue",
      },
    },
    autoApprovalEnabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    autoApprovalLimit: {
      type: Number,
      required: true,
      min: [0, "autoApprovalLimit cannot be negative"],
      default: 50000,
      validate: {
        validator: function (this: any, v: number) {
          return this.maxOrderValue === undefined || v <= this.maxOrderValue;
        },
        message: "autoApprovalLimit cannot be greater than maxOrderValue",
      },
    },
    freeShippingThreshold: {
      type: Number,
      required: true,
      min: [0, "freeShippingThreshold cannot be negative"],
      default: 5000,
    },
    maxNegotiationRounds: {
      type: Number,
      required: true,
      min: [0, "maxNegotiationRounds cannot be negative"],
      max: [20, "maxNegotiationRounds cannot exceed 20"],
      default: 3,
      validate: {
        validator: Number.isInteger,
        message: "maxNegotiationRounds must be an integer",
      },
    },
    allowedCurrencies: {
      type: [String],
      required: true,
      default: ["INR"],
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0,
        message: "allowedCurrencies must contain at least one currency",
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
policySchema.index({ merchantId: 1, isActive: 1 });

const Policy = mongoose.model<IPolicy>("Policy", policySchema);

export default Policy;
