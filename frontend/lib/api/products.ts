import { apiClient } from "./client";
import type { Product, ProductsApiResponse, SingleProductApiResponse } from "@/types/product";

export interface GetProductsParams {
  merchantId?: string;
  category?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function fetchProducts(params?: GetProductsParams): Promise<ProductsApiResponse> {
  const searchParams = new URLSearchParams();
  if (params?.merchantId) searchParams.set("merchantId", params.merchantId);
  if (params?.category && params.category !== "all") searchParams.set("category", params.category);
  if (params?.status && params.status !== "all") searchParams.set("status", params.status);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const queryString = searchParams.toString();
  const endpoint = `/api/products${queryString ? `?${queryString}` : ""}`;
  return apiClient.get<ProductsApiResponse>(endpoint);
}

export async function fetchProductById(id: string): Promise<SingleProductApiResponse> {
  return apiClient.get<SingleProductApiResponse>(`/api/products/${id}`);
}

export async function createProduct(data: Partial<Product>): Promise<SingleProductApiResponse> {
  return apiClient.post<SingleProductApiResponse>("/api/products", data);
}

export async function updateProduct(id: string, data: Partial<Product>): Promise<SingleProductApiResponse> {
  return apiClient.put<SingleProductApiResponse>(`/api/products/${id}`, data);
}

export async function deleteProduct(id: string): Promise<SingleProductApiResponse> {
  return apiClient.delete<SingleProductApiResponse>(`/api/products/${id}`);
}
