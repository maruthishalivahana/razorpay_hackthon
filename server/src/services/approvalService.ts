import mongoose from "mongoose";
import Approval, { type IApproval } from "../models/Approval.js";
import { AppCustomError } from "./negotiationService.js";

export const createApprovalRequest = async (
  agreementId: string | mongoose.Types.ObjectId,
  merchantId: string | mongoose.Types.ObjectId,
  reason?: string
): Promise<IApproval> => {
  const existing = await Approval.findOne({ agreementId });
  if (existing) {
    return existing;
  }

  const approval = new Approval({
    agreementId,
    merchantId,
    status: "PENDING",
    reason,
    requestedAt: new Date(),
  });

  return await approval.save();
};

export const getApprovalByAgreement = async (
  agreementId: string
): Promise<IApproval | null> => {
  if (!mongoose.Types.ObjectId.isValid(agreementId)) {
    throw new AppCustomError("APPROVAL_NOT_FOUND", "Invalid agreement ID format", 400);
  }

  return await Approval.findOne({ agreementId });
};

export const getApprovalById = async (
  approvalId: string
): Promise<IApproval> => {
  if (!mongoose.Types.ObjectId.isValid(approvalId)) {
    throw new AppCustomError("APPROVAL_NOT_FOUND", "Invalid approval ID format", 400);
  }

  const approval = await Approval.findById(approvalId);
  if (!approval) {
    throw new AppCustomError("APPROVAL_NOT_FOUND", "Approval request not found", 404);
  }

  return approval;
};
