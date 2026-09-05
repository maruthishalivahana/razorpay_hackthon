export type SpecificationValue = string | number | boolean;

export interface ProductSpecification {
  key: string;
  value: SpecificationValue;
  type: "string" | "number" | "boolean";
}

export interface Product {
  _id?: string;
  id?: string;
  merchantId: string;
  name: string;
  description: string;
  category: string;
  sku: string;
  price: number;
  costPrice?: number;
  currency?: string;
  inventory: number;
  deliveryDays: number;
  tags?: string[];
  imageUrl?: string;
  image?: string;
  isNegotiable: boolean;
  /**
   * Structured key-value attributes for product specifications.
   * e.g., { brand: "Apple", model: "MacBook Pro", ram: "16GB", storage: "512GB" }
   */
  specifications?: Record<string, SpecificationValue>;
  status: "active" | "inactive" | "out_of_stock" | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ProductsApiResponse {
  success: boolean;
  data: Product[];
  pagination?: ProductPagination;
}

export interface SingleProductApiResponse {
  success: boolean;
  data: Product;
  message?: string;
}
