import mongoose, { Schema, Document } from "mongoose";

export type AuditActorType = "BUYER" | "MERCHANT" | "SYSTEM" | "AGENT" | "PAYMENT_PROVIDER";

export type AuditEventType =
  | "NEGOTIATION_STARTED"
  | "BUYER_OFFER_SUBMITTED"
  | "MERCHANT_COUNTER_OFFERED"
  | "NEGOTIATION_ACCEPTED"
  | "NEGOTIATION_REJECTED"
  | "NEGOTIATION_EXPIRED"
  | "AGREEMENT_CREATED"
  | "AGREEMENT_VALIDATED"
  | "AGREEMENT_VALIDATION_FAILED"
  | "APPROVAL_REQUESTED"
  | "AGREEMENT_AUTO_APPROVED"
  | "AGREEMENT_APPROVED"
  | "AGREEMENT_REJECTED"
  | "AGREEMENT_EXPIRED"
  | "PAYMENT_READY"
  | "POLICY_EVALUATED"
  | "POLICY_AUTO_APPROVED"
  | "POLICY_BLOCKED"
  | "INVENTORY_CHECKED"
  | "INVENTORY_DEDUCTED"
  | "INVENTORY_UNAVAILABLE"
  | "PAYMENT_ORDER_CREATED"
  | "PAYMENT_VERIFICATION_STARTED"
  | "PAYMENT_VERIFIED"
  | "PAYMENT_CAPTURED"
  | "PAYMENT_FAILED"
  | "ORDER_PLACED"
  | "ORDER_FAILED"
  | "NEGOTIATION_FAILED";

export interface IAuditEvent extends Document {
  merchantId: mongoose.Types.ObjectId;
  negotiationId?: mongoose.Types.ObjectId;
  agreementId?: mongoose.Types.ObjectId;
  approvalId?: mongoose.Types.ObjectId;
  orderId?: string;
  paymentId?: string;
  productId?: mongoose.Types.ObjectId;
  eventType: AuditEventType | string;
  actorType: AuditActorType;
  actorId?: string;
  description: string;
  data?: Record<string, any>;
  createdAt: Date;
}

const auditEventSchema = new Schema<IAuditEvent>(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
    },
    negotiationId: {
      type: Schema.Types.ObjectId,
      ref: "Negotiation",
    },
    agreementId: {
      type: Schema.Types.ObjectId,
      ref: "Agreement",
    },
    approvalId: {
      type: Schema.Types.ObjectId,
      ref: "Approval",
    },
    orderId: { type: String, trim: true },
    paymentId: { type: String, trim: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    eventType: {
      type: String,
      required: true,
      trim: true,
    },
    actorType: {
      type: String,
      enum: ["BUYER", "MERCHANT", "SYSTEM", "AGENT", "PAYMENT_PROVIDER"],
      required: true,
    },
    actorId: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    data: {
      type: Schema.Types.Mixed,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Indexes for fast chronological lookup
auditEventSchema.index({ merchantId: 1, createdAt: 1 });
auditEventSchema.index({ agreementId: 1, createdAt: 1 });
auditEventSchema.index({ negotiationId: 1, createdAt: 1 });
auditEventSchema.index({ merchantId: 1, eventType: 1, createdAt: -1 });

const AuditEvent = mongoose.model<IAuditEvent>("AuditEvent", auditEventSchema);

export default AuditEvent;
