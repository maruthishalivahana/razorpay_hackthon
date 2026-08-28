import { Type, type FunctionDeclaration } from "@google/genai";
import {
  searchProducts,
  type ProductSearchParams,
  type PublicProduct,
  type ProductSearchResult,
} from "../../services/productService.js";

export interface SearchProductsToolInput extends ProductSearchParams {}

export interface SearchProductsToolOutput {
  success: boolean;
  products: PublicProduct[];
  total: number;
  returned: number;
  searchCriteria: any;
}

export const searchProductsToolDeclaration: FunctionDeclaration = {
  name: "searchProducts",
  description: "Search for products available from connected merchants matching query, category, price range, and quantity.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: "Search term or keyword (e.g., 'laptop', 'chair').",
      },
      category: {
        type: Type.STRING,
        description: "Product category filter (e.g., 'Laptop', 'Office Furniture').",
      },
      minPrice: {
        type: Type.NUMBER,
        description: "Minimum price threshold in INR.",
      },
      maxPrice: {
        type: Type.NUMBER,
        description: "Maximum price budget threshold in INR.",
      },
      quantity: {
        type: Type.NUMBER,
        description: "Required quantity to purchase.",
      },
      minInventory: {
        type: Type.NUMBER,
        description: "Minimum inventory available.",
      },
      requirements: {
        type: Type.OBJECT,
        description: "Key-value specifications (e.g., { 'ram': '16GB' }).",
      },
      limit: {
        type: Type.NUMBER,
        description: "Maximum number of product results to return (1-20, default 5).",
      },
      sortBy: {
        type: Type.STRING,
        enum: ["relevance", "price_asc", "price_desc"],
        description: "Sort order for returned products.",
      },
    },
  },
};

export const searchProductsTool = async (
  input: SearchProductsToolInput
): Promise<SearchProductsToolOutput> => {
  console.log("[BUYER_AGENT] Tool: searchProducts");
  console.log("[BUYER_AGENT] Parameters:", JSON.stringify(input));

  try {
    const result: ProductSearchResult = await searchProducts(input);
    console.log(`[BUYER_AGENT] Results: ${result.returned}`);

    return {
      success: true,
      products: result.products,
      total: result.total,
      returned: result.returned,
      searchCriteria: result.searchCriteria,
    };
  } catch (error: any) {
    console.error("[BUYER_AGENT] Tool Error:", error.message || error);
    throw error;
  }
};
