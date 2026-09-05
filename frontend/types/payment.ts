export type PaymentStatus =
  | "PAYMENT_READY"
  | "RAZORPAY_ORDER_CREATED"
  | "CHECKOUT_OPEN"
  | "VERIFICATION_PENDING"
  | "VERIFIED"
  | "FAILED"
  | "CANCELLED"
  | "CAPTURED";

export interface CreatePaymentOrderResponse {
  success: boolean;
  data: {
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    agreementId: string;
  };
  error?: string;
  message?: string;
}

export interface VerifyPaymentRequest {
  agreementId: string;
  razorpayPaymentId: string;
  razorpayOrderId: string;
  razorpaySignature: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  message?: string;
  data?: {
    paymentId: string;
    agreementId: string;
    razorpayPaymentId: string;
    razorpayOrderId: string;
    status: PaymentStatus;
    product?: {
      id: string;
      inventory: number;
      status: string;
    };
  };
  error?: string;
}

export interface GetPaymentStatusResponse {
  success: boolean;
  data?: {
    agreementId: string;
    merchantId: string;
    productId: string;
    paymentId: string | null;
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    amount: number;
    currency: string;
    status: PaymentStatus;
    agreementStatus: string;
  };
  error?: string;
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  image?: string;
  order_id: string;
  handler: (response: RazorpaySuccessResponse) => void;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
