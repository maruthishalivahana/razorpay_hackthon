import { apiClient } from "./client";
import type { Merchant, MerchantsApiResponse } from "@/types/merchant";

export async function fetchMerchants(): Promise<MerchantsApiResponse> {
  return apiClient.get<MerchantsApiResponse>("/api/merchants");
}

export async function fetchMerchantById(
  id: string
): Promise<{ success: boolean; data: Merchant }> {
  return apiClient.get<{ success: boolean; data: Merchant }>(`/api/merchants/${id}`);
}

export async function updateMerchant(
  id: string,
  data: Partial<Merchant>
): Promise<{ success: boolean; data: Merchant }> {
  return apiClient.put<{ success: boolean; data: Merchant }>(`/api/merchants/${id}`, data);
}
