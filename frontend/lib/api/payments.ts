import { apiClient } from "./client";
import type {
  CreatePaymentOrderResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  GetPaymentStatusResponse,
} from "@/types/payment";

export async function createPaymentOrder(
  agreementId: string
): Promise<CreatePaymentOrderResponse> {
  return apiClient.post<CreatePaymentOrderResponse>("/api/payments/create-order", {
    agreementId,
  });
}

export async function verifyPayment(
  payload: VerifyPaymentRequest
): Promise<VerifyPaymentResponse> {
  return apiClient.post<VerifyPaymentResponse>("/api/payments/verify", payload);
}

export async function getPaymentStatus(
  agreementId: string
): Promise<GetPaymentStatusResponse> {
  return apiClient.get<GetPaymentStatusResponse>(`/api/payments/agreement/${agreementId}`);
}

export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
