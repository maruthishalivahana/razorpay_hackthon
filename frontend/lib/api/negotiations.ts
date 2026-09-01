import { apiClient } from "./client";
import type {
  NegotiationsListApiResponse,
  SingleNegotiationApiResponse,
} from "@/types/negotiation";

export interface GetNegotiationsParams {
  merchantId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function fetchNegotiations(
  params?: GetNegotiationsParams
): Promise<NegotiationsListApiResponse> {
  const searchParams = new URLSearchParams();
  if (params?.merchantId) searchParams.set("merchantId", params.merchantId);
  if (params?.status && params.status !== "ALL") searchParams.set("status", params.status);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const queryString = searchParams.toString();
  const endpoint = `/api/negotiations${queryString ? `?${queryString}` : ""}`;
  return apiClient.get<NegotiationsListApiResponse>(endpoint);
}

export async function fetchNegotiationById(
  id: string
): Promise<SingleNegotiationApiResponse> {
  return apiClient.get<SingleNegotiationApiResponse>(`/api/negotiations/${id}`);
}
