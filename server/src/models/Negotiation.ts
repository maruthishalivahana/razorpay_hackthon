import mongoose, { Schema, Document } from "mongoose";

export interface INegotiationHistory {
  round: number;
  actor: "BUYER" | "MERCHANT";
  offer: number;
  timestamp: Date;
}

export type NegotiationStatus = "ACTIVE" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export interface INegotiation extends Document {
  merchantId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  policyId: mongoose.Types.ObjectId;
  status: NegotiationStatus;
  quantity: number;
  currency: string;
  originalUnitPrice: number;
  currentBuyerOffer?: number;
  currentMerchantOffer?: number;
  currentDiscountPercent?: number;
  currentMarginPercent?: number;
  currentRound: number;
  maxRounds: number;
  acceptedPrice?: number;
  finalOrderValue?: number;
  startedAt: Date;
  completedAt?: Date;
  history: INegotiationHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const historySchema = new Schema<INegotiationHistory>(
  {
    round: {
      type: Number,
      required: true,
      min: 1,
    },
    actor: {
      type: String,
      enum: ["BUYER", "MERCHANT"],
      required: true,
    },
    offer: {
      type: Number,
      required: true,
      min: 0,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: false }
);

const negotiationSchema = new Schema<INegotiation>(
  {
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
      enum: ["ACTIVE", "ACCEPTED", "REJECTED", "EXPIRED"],
      required: true,
      default: "ACTIVE",
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
    currentBuyerOffer: {
      type: Number,
      min: 0,
    },
    currentMerchantOffer: {
      type: Number,
      min: 0,
    },
    currentDiscountPercent: {
      type: Number,
      min: 0,
      max: 100,
    },
    currentMarginPercent: {
      type: Number,
      min: 0,
      max: 100,
    },
    currentRound: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    maxRounds: {
      type: Number,
      required: true,
      min: 1,
    },
    acceptedPrice: {
      type: Number,
      min: 0,
    },
    finalOrderValue: {
      type: Number,
      min: 0,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
    history: {
      type: [historySchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes
negotiationSchema.index({ merchantId: 1 });
negotiationSchema.index({ productId: 1 });
negotiationSchema.index({ status: 1 });
negotiationSchema.index({ createdAt: -1 });

const Negotiation = mongoose.model<INegotiation>(
  "Negotiation",
  negotiationSchema
);

export default Negotiation;
