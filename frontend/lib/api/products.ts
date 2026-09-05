import { apiClient } from "./client";
import type {
  Product,
  ProductsApiResponse,
  SingleProductApiResponse,
  SpecificationValue,
} from "@/types/product";

export interface GetProductsParams {
  merchantId?: string;
  category?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Normalizes product data from API responses to ensure:
 * - specifications is always a clean Record<string, SpecificationValue> (handling Mongoose Maps / plain objects)
 * - tags is always a clean string[]
 */
export function normalizeProduct(
  product: Partial<Product> | Record<string, unknown> | null | undefined
): Product {
  if (!product || typeof product !== "object") return product as unknown as Product;

  let specifications: Record<string, SpecificationValue> | undefined = undefined;

  const rawSpecs = product.specifications;
  if (rawSpecs) {
    if (rawSpecs instanceof Map) {
      specifications = Object.fromEntries(rawSpecs.entries());
    } else if (typeof rawSpecs === "object") {
      specifications = { ...(rawSpecs as Record<string, SpecificationValue>) };
    }
  }

  const rawObj = product as Record<string, unknown>;
  const resolvedImageUrl =
    (typeof rawObj.imageUrl === "string" && rawObj.imageUrl.trim()) ||
    (typeof rawObj.image === "string" && rawObj.image.trim()) ||
    undefined;

  return {
    ...(product as unknown as Product),
    imageUrl: resolvedImageUrl,
    image: resolvedImageUrl,
    tags: Array.isArray(product.tags) ? (product.tags as string[]) : [],
    specifications,
  };
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
  const response = await apiClient.get<ProductsApiResponse>(endpoint);

  if (response && Array.isArray(response.data)) {
    return {
      ...response,
      data: response.data.map(normalizeProduct),
    };
  }

  return response;
}

export async function fetchProductById(id: string): Promise<SingleProductApiResponse> {
  const response = await apiClient.get<SingleProductApiResponse>(`/api/products/${id}`);
  if (response && response.data) {
    return {
      ...response,
      data: normalizeProduct(response.data),
    };
  }
  return response;
}

export async function createProduct(data: Partial<Product>): Promise<SingleProductApiResponse> {
  const response = await apiClient.post<SingleProductApiResponse>("/api/products", data);
  if (response && response.data) {
    return {
      ...response,
      data: normalizeProduct(response.data),
    };
  }
  return response;
}

export async function updateProduct(id: string, data: Partial<Product>): Promise<SingleProductApiResponse> {
  const response = await apiClient.put<SingleProductApiResponse>(`/api/products/${id}`, data);
  if (response && response.data) {
    return {
      ...response,
      data: normalizeProduct(response.data),
    };
  }
  return response;
}

export async function deleteProduct(id: string): Promise<SingleProductApiResponse> {
  return apiClient.delete<SingleProductApiResponse>(`/api/products/${id}`);
}
