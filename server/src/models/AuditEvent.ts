import mongoose, { Schema, Document } from "mongoose";

export type AuditActorType = "BUYER" | "MERCHANT" | "SYSTEM" | "AGENT";

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
  | "PAYMENT_READY";

export interface IAuditEvent extends Document {
  merchantId: mongoose.Types.ObjectId;
  negotiationId?: mongoose.Types.ObjectId;
  agreementId?: mongoose.Types.ObjectId;
  approvalId?: mongoose.Types.ObjectId;
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
    eventType: {
      type: String,
      required: true,
      trim: true,
    },
    actorType: {
      type: String,
      enum: ["BUYER", "MERCHANT", "SYSTEM", "AGENT"],
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

const AuditEvent = mongoose.model<IAuditEvent>("AuditEvent", auditEventSchema);

export default AuditEvent;
