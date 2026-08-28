import mongoose, { Schema, Document } from "mongoose";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface IApproval extends Document {
  agreementId: mongoose.Types.ObjectId;
  merchantId: mongoose.Types.ObjectId;
  status: ApprovalStatus;
  reason?: string;
  requestedAt: Date;
  reviewedAt?: Date;
  reviewer?: string;
  createdAt: Date;
  updatedAt: Date;
}

const approvalSchema = new Schema<IApproval>(
  {
    agreementId: {
      type: Schema.Types.ObjectId,
      ref: "Agreement",
      required: true,
      unique: true,
    },
    merchantId: {
      type: Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      required: true,
      default: "PENDING",
    },
    reason: {
      type: String,
      trim: true,
    },
    requestedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    reviewedAt: {
      type: Date,
    },
    reviewer: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
approvalSchema.index({ merchantId: 1 });
approvalSchema.index({ status: 1 });

const Approval = mongoose.model<IApproval>("Approval", approvalSchema);

export default Approval;
