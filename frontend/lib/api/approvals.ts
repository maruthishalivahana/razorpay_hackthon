import { apiClient } from "./client";
import type {
  ApprovalInfo,
  ApproveAgreementResult,
  RejectAgreementResult,
} from "@/types/agreement";

export interface SingleApprovalApiResponse {
  success: boolean;
  data: ApprovalInfo | null;
}

export async function fetchApprovalByAgreement(
  agreementId: string
): Promise<SingleApprovalApiResponse> {
  return apiClient.get<SingleApprovalApiResponse>(`/api/approvals/agreement/${agreementId}`);
}

export async function approveApproval(
  approvalId: string,
  reviewer: string = "Merchant Reviewer"
): Promise<ApproveAgreementResult> {
  return apiClient.post<ApproveAgreementResult>(`/api/approvals/${approvalId}/approve`, {
    reviewer,
  });
}

export async function rejectApproval(
  approvalId: string,
  reviewer: string = "Merchant Reviewer",
  reason?: string
): Promise<RejectAgreementResult> {
  return apiClient.post<RejectAgreementResult>(`/api/approvals/${approvalId}/reject`, {
    reviewer,
    reason: reason || "Rejected by merchant",
  });
}
