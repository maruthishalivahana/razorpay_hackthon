import { apiClient } from "./client";
import type {
  BuyerChatApiResponse,
  BuyerChatActionPayload,
} from "@/types/buyer";

export interface SendBuyerMessageParams {
  conversationId?: string;
  message?: string;
  action?: BuyerChatActionPayload;
}

export async function sendBuyerMessage(
  params: SendBuyerMessageParams
): Promise<BuyerChatApiResponse> {
  return apiClient.post<BuyerChatApiResponse>("/api/agents/buyer/chat", params);
}
