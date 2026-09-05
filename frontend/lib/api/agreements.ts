import { apiClient } from "./client";
import type {
  AgreementsListApiResponse,
  SingleAgreementApiResponse,
  PaymentReadyApiResponse,
  ApproveAgreementResult,
  RejectAgreementResult,
} from "@/types/agreement";

export interface GetAgreementsParams {
  merchantId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function fetchAgreements(
  params?: GetAgreementsParams
): Promise<AgreementsListApiResponse> {
  const searchParams = new URLSearchParams();
  if (params?.merchantId) searchParams.set("merchantId", params.merchantId);
  if (params?.status && params.status !== "ALL") searchParams.set("status", params.status);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const queryString = searchParams.toString();
  const endpoint = `/api/agreements${queryString ? `?${queryString}` : ""}`;
  return apiClient.get<AgreementsListApiResponse>(endpoint);
}

export async function fetchAgreementById(
  id: string
): Promise<SingleAgreementApiResponse> {
  return apiClient.get<SingleAgreementApiResponse>(`/api/agreements/${id}`);
}

export async function fetchAgreementPaymentReady(
  id: string
): Promise<PaymentReadyApiResponse> {
  return apiClient.get<PaymentReadyApiResponse>(`/api/agreements/${id}/payment-ready`);
}

export async function approveAgreement(
  id: string,
  reviewer: string = "Merchant Reviewer"
): Promise<ApproveAgreementResult> {
  return apiClient.post<ApproveAgreementResult>(`/api/agreements/${id}/approve`, {
    reviewer,
  });
}

export async function rejectAgreement(
  id: string,
  reviewer: string = "Merchant Reviewer",
  reason?: string
): Promise<RejectAgreementResult> {
  return apiClient.post<RejectAgreementResult>(`/api/agreements/${id}/reject`, {
    reviewer,
    reason: reason || "Rejected by merchant",
  });
}
