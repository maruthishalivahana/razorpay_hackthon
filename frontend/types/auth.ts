export type UserRole = "BUYER" | "MERCHANT";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  merchantId: string | null;
  buyerId: string | null;
  phone: string | null;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  data?: User;
}

export interface LoginRequest {
  email: string;
  password: string;
  role?: UserRole;
}

export interface RegisterBuyerRequest {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface RegisterMerchantRequest {
  name: string;
  businessName: string;
  email: string;
  password: string;
  phone?: string;
  description?: string;
  currency?: string;
}
