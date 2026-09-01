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
  isNegotiable: boolean;
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
