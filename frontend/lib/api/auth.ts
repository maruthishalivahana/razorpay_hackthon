import { apiClient } from "./client";
import type {
  User,
  AuthResponse,
  LoginRequest,
  RegisterBuyerRequest,
  RegisterMerchantRequest,
} from "@/types/auth";

export async function login(data: LoginRequest): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>("/api/auth/login", data);
}

export async function registerBuyer(data: RegisterBuyerRequest): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>("/api/auth/register/buyer", data);
}

export async function registerMerchant(data: RegisterMerchantRequest): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>("/api/auth/register/merchant", data);
}

export async function logout(): Promise<{ success: boolean; message: string }> {
  return apiClient.post<{ success: boolean; message: string }>("/api/auth/logout");
}

export async function getCurrentUser(): Promise<{ success: boolean; data: User }> {
  return apiClient.get<{ success: boolean; data: User }>("/api/auth/me");
}
