import { apiClient } from "./client";
import type { Policy, PolicyApiResponse } from "@/types/policy";

export async function fetchMerchantPolicy(merchantId: string): Promise<PolicyApiResponse> {
  return apiClient.get<PolicyApiResponse>(`/api/policies/merchant/${merchantId}`);
}

export async function fetchMyPolicy(): Promise<PolicyApiResponse> {
  return apiClient.get<PolicyApiResponse>("/api/policies/me");
}

export async function updatePolicy(policyId: string, data: Partial<Policy>): Promise<PolicyApiResponse> {
  return apiClient.put<PolicyApiResponse>(`/api/policies/${policyId}`, data);
}

export async function createPolicy(data: Partial<Policy>): Promise<PolicyApiResponse> {
  return apiClient.post<PolicyApiResponse>("/api/policies", data);
}
