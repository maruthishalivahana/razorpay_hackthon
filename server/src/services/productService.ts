import mongoose from "mongoose";
import Product, { type IProduct } from "../models/Product.js";
import Merchant from "../models/Merchant.js";
import { AppError } from "../middleware/errorHandler.js";
import { AppCustomError } from "./negotiationService.js";

export interface GetProductsQuery {
  merchantId?: string;
  category?: string;
  status?: string;
  search?: string;
  page?: string | number;
  limit?: string | number;
}

export interface PaginatedProductsResponse {
  data: IProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProductSearchParams {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minInventory?: number;
  quantity?: number;
  merchantId?: string;
  requirements?: Record<string, any>;
  hardRequirements?: Record<string, any>;
  preferences?: Record<string, any>;
  softPreferences?: Record<string, any>;
  limit?: number;
  sortBy?: "relevance" | "price_asc" | "price_desc";
}

export interface PublicProduct {
  id: string;
  merchantId: string;
  name: string;
  description: string;
  category: string;
  sku: string;
  price: number;
  currency: string;
  inventory: number;
  deliveryDays: number;
  tags?: string[];
  imageUrl?: string;
  isNegotiable: boolean;
}

export interface ProductSearchResult {
  products: PublicProduct[];
  total: number;
  returned: number;
  searchCriteria: {
    query?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    minInventory?: number;
    quantity?: number;
    merchantId?: string;
    requirements?: Record<string, any>;
    hardRequirements?: Record<string, any>;
    softPreferences?: Record<string, any>;
    limit: number;
    sortBy: "relevance" | "price_asc" | "price_desc";
  };
}

const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const toPublicProduct = (product: IProduct): PublicProduct => {
  let mId = "";
  if (product.merchantId) {
    mId = typeof product.merchantId === "object" && (product.merchantId as any)._id
      ? (product.merchantId as any)._id.toString()
      : product.merchantId.toString();
  }

  return {
    id: product._id.toString(),
    merchantId: mId,
    name: product.name,
    description: product.description,
    category: product.category,
    sku: product.sku,
    price: product.price,
    currency: product.currency || "INR",
    inventory: product.inventory,
    deliveryDays: product.deliveryDays,
    tags: product.tags,
    imageUrl: product.imageUrl,
    isNegotiable: product.isNegotiable,
  };
};

export const SUPPORTED_HARD_REQUIREMENT_KEYS = new Set([
  "ergonomic",
  "ergonomics",
  "adjustableheight",
  "adjustable_height",
  "heightadjustable",
  "height_adjustable",
  "lumbarsupport",
  "lumbar_support",
  "ram",
  "storage",
  "ssd",
  "hdd",
  "processor",
  "cpu",
  "screensize",
  "screen_size",
  "brand",
  "material",
  "mesh",
  "leather",
  "color",
  "colour",
  "size",
  "wireless",
  "bluetooth",
  "gaming",
  "foldable",
  "folding",
  "wheels",
  "armrest",
  "armrests",
  "reclining",
  "recliner",
  "warranty",
  "deliverydays",
  "isnegotiable",
]);

export interface CatalogCapabilities {
  supportedHardKeys: Set<string>;
  searchableFields: string[];
}

export const getCatalogCapabilities = (): CatalogCapabilities => {
  return {
    supportedHardKeys: SUPPORTED_HARD_REQUIREMENT_KEYS,
    searchableFields: ["name", "description", "category", "tags"],
  };
};

export const validateCatalogRequirements = (
  rawHard: Record<string, any> = {},
  rawSoft: Record<string, any> = {},
  capabilities: CatalogCapabilities = getCatalogCapabilities()
): {
  hardRequirements: Record<string, string | number | boolean>;
  softPreferences: Record<string, string | number | boolean>;
  unsupported: Record<string, string | number | boolean>;
} => {
  const hardRequirements: Record<string, string | number | boolean> = {};
  const softPreferences: Record<string, string | number | boolean> = {};
  const unsupported: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(rawHard)) {
    if (value === undefined || value === null) continue;
    const normalizedKey = key.replace(/[\s_-]+/g, "").toLowerCase();
    if (capabilities.supportedHardKeys.has(normalizedKey)) {
      hardRequirements[key] = value;
    } else {
      softPreferences[key] = value;
      unsupported[key] = value;
    }
  }

  for (const [key, value] of Object.entries(rawSoft)) {
    if (value === undefined || value === null) continue;
    softPreferences[key] = value;
    const normalizedKey = key.replace(/[\s_-]+/g, "").toLowerCase();
    if (!capabilities.supportedHardKeys.has(normalizedKey)) {
      unsupported[key] = value;
    }
  }

  return { hardRequirements, softPreferences, unsupported };
};

export const classifyRequirements = (
  requirements?: Record<string, any>
): { supported: Record<string, any>; unsupported: Record<string, any> } => {
  const supported: Record<string, any> = {};
  const unsupported: Record<string, any> = {};

  if (!requirements || typeof requirements !== "object") {
    return { supported, unsupported };
  }

  for (const [key, value] of Object.entries(requirements)) {
    if (value === undefined || value === null) continue;
    const normalizedKey = key.replace(/[\s_-]+/g, "").toLowerCase();
    if (SUPPORTED_HARD_REQUIREMENT_KEYS.has(normalizedKey)) {
      supported[key] = value;
    } else {
      unsupported[key] = value;
    }
  }

  return { supported, unsupported };
};

export const searchProducts = async (
  params: ProductSearchParams
): Promise<ProductSearchResult> => {
  const {
    query,
    category,
    minPrice,
    maxPrice,
    minInventory,
    quantity,
    merchantId,
    requirements,
    limit: rawLimit,
    sortBy = "relevance",
  } = params;

  // Validation
  if (minPrice !== undefined && (typeof minPrice !== "number" || minPrice < 0 || isNaN(minPrice))) {
    throw new AppCustomError(
      "INVALID_SEARCH_PARAMS",
      "minPrice must be a non-negative number.",
      400
    );
  }

  if (maxPrice !== undefined && (typeof maxPrice !== "number" || maxPrice < 0 || isNaN(maxPrice))) {
    throw new AppCustomError(
      "INVALID_SEARCH_PARAMS",
      "maxPrice must be a non-negative number.",
      400
    );
  }

  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new AppCustomError(
      "INVALID_SEARCH_PARAMS",
      "maxPrice must be greater than or equal to minPrice.",
      400
    );
  }

  if (minInventory !== undefined && (typeof minInventory !== "number" || minInventory < 0)) {
    throw new AppCustomError(
      "INVALID_SEARCH_PARAMS",
      "minInventory cannot be negative.",
      400
    );
  }

  if (quantity !== undefined && (typeof quantity !== "number" || quantity < 0)) {
    throw new AppCustomError(
      "INVALID_SEARCH_PARAMS",
      "quantity cannot be negative.",
      400
    );
  }

  const limit = Math.min(20, Math.max(1, rawLimit ?? 5));
  if (rawLimit !== undefined && (rawLimit < 1 || rawLimit > 20)) {
    throw new AppCustomError(
      "INVALID_SEARCH_PARAMS",
      "limit must be between 1 and 20.",
      400
    );
  }

  const filter: any = { status: "active" };

  if (merchantId) {
    if (!mongoose.Types.ObjectId.isValid(merchantId)) {
      throw new AppCustomError("INVALID_SEARCH_PARAMS", "Invalid merchant ID format", 400);
    }
    filter.merchantId = merchantId;
  }

  if (category && category.trim().length > 0) {
    filter.category = { $regex: new RegExp(`^${escapeRegex(category.trim())}$`, "i") };
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = minPrice;
    if (maxPrice !== undefined) filter.price.$lte = maxPrice;
  }

  const requiredInventory = quantity ?? minInventory ?? 1;
  filter.inventory = { $gte: requiredInventory };

  const tokenize = (str: string): string[] => {
    return str.trim().toLowerCase().split(/\s+/).filter(Boolean).map(t => {
      if (/(?:ss|is|us|as|os|yes|this|glass|dress|business|less|mass|boss|cross|furniture)$/i.test(t)) return t;
      if (t.length > 3 && t.endsWith("s")) return t.slice(0, -1);
      return t;
    });
  };

  if (query && query.trim().length > 0) {
    const tokens = tokenize(query);
    if (tokens.length > 0) {
      filter.$and = tokens.map(token => {
        const tRegex = new RegExp(escapeRegex(token), "i");
        return {
          $or: [
            { name: tRegex },
            { description: tRegex },
            { category: tRegex },
            { tags: tRegex },
          ]
        };
      });
    }
  }

  // Fetch candidates from MongoDB
  console.log("Searching MongoDB with filter:", JSON.stringify(filter));
  let rawProducts = await Product.find(filter);
  console.log("MongoDB returned items:", rawProducts.length);

  // Requirements classification via Catalog Capabilities
  const rawHardInput = params.hardRequirements || params.requirements || {};
  const rawSoftInput = params.softPreferences || params.preferences || {};
  const { hardRequirements: validatedHard, softPreferences: validatedSoft } = validateCatalogRequirements(rawHardInput, rawSoftInput);

  // Requirements filtering (ONLY supported hard requirements filter rawProducts)
  const hardEntries = Object.entries(validatedHard);
  if (hardEntries.length > 0) {
    rawProducts = rawProducts.filter((p) => {
      const fullText = `${p.name} ${p.description} ${(p.tags || []).join(" ")}`.toLowerCase();
      return hardEntries.every(([key, value]) => {
        if (value === false) return true;
        if (value === true || String(value).toLowerCase() === "true" || String(value).toLowerCase() === "yes") {
          const readableKey = key.replace(/([A-Z])/g, " $1").trim().toLowerCase();
          return fullText.includes(readableKey);
        } else {
          const strVal = String(value).toLowerCase();
          return fullText.includes(strVal);
        }
      });
    });
  }

  const total = rawProducts.length;

  // Sorting
  if (sortBy === "price_asc") {
    rawProducts.sort((a, b) => a.price - b.price);
  } else if (sortBy === "price_desc") {
    rawProducts.sort((a, b) => b.price - a.price);
  } else {
    // Relevance scoring
    const queryTokens = query ? tokenize(query) : [];
    const catStr = (category || "").trim().toLowerCase();
    const exactQuery = (query || "").trim().toLowerCase();

    const scored = rawProducts.map((p) => {
      let score = 0;
      const nameLower = p.name.toLowerCase();
      const descLower = p.description.toLowerCase();
      const catLower = p.category.toLowerCase();

      if (exactQuery) {
        if (nameLower === exactQuery) score += 100;
        else if (nameLower.includes(exactQuery)) score += 50;
        if (catLower.includes(exactQuery)) score += 30;
        if (descLower.includes(exactQuery)) score += 10;
      }

      if (catStr && catLower.includes(catStr)) {
        score += 40;
      }

      if (p.inventory > 0) score += 5;

      // Soft preference relevance boost
      const softEntries = Object.entries(validatedSoft);
      if (softEntries.length > 0) {
        const fullText = `${p.name} ${p.description} ${(p.tags || []).join(" ")}`.toLowerCase();
        for (const [sKey, sVal] of softEntries) {
          if (sVal === false) continue;
          const keyTerms = sKey.replace(/([A-Z])/g, " $1").trim().toLowerCase().split(/\s+/);
          const valTerms = typeof sVal === "string" ? sVal.toLowerCase().split(/\s+/) : [];
          const terms = [...keyTerms, ...valTerms].filter((t) => t.length > 2);
          for (const term of terms) {
            if (fullText.includes(term)) {
              score += 15;
              break;
            }
          }
        }
      }

      return { product: p, score };
    });
    
    console.log("Scores computed. Sorting...", scored.length);

    scored.sort((a, b) => b.score - a.score || b.product.createdAt.getTime() - a.product.createdAt.getTime());
    rawProducts = scored.map((s) => s.product);
    console.log("Sorted");
  }

  const sliced = rawProducts.slice(0, limit);
  const publicProducts = sliced.map(toPublicProduct);

  return {
    products: publicProducts,
    total,
    returned: publicProducts.length,
    searchCriteria: {
      query,
      category,
      minPrice,
      maxPrice,
      minInventory,
      quantity,
      merchantId,
      requirements: validatedHard,
      hardRequirements: validatedHard,
      softPreferences: validatedSoft,
      limit,
      sortBy,
    },
  };
};

export const createProduct = async (
  data: Partial<IProduct>
): Promise<IProduct> => {
  if (!data.merchantId || !mongoose.Types.ObjectId.isValid(data.merchantId.toString())) {
    throw new AppError("Invalid or missing merchantId", 400);
  }

  const merchantExists = await Merchant.exists({ _id: data.merchantId });
  if (!merchantExists) {
    throw new AppError("Merchant not found", 404);
  }

  if (data.sku) {
    const existingSku = await Product.findOne({ sku: data.sku.toUpperCase() });
    if (existingSku) {
      throw new AppError("Product with this SKU already exists", 409);
    }
  }

  try {
    const product = new Product(data);
    return await product.save();
  } catch (error: any) {
    if (error.code === 11000) {
      throw new AppError("Product with this SKU already exists", 409);
    }
    throw error;
  }
};

export const getProductById = async (id: string): Promise<IProduct> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Product ID format", 400);
  }

  const product = await Product.findById(id).populate(
    "merchantId",
    "name businessName email currency"
  );
  if (!product) {
    throw new AppError("Product not found", 404);
  }

  return product;
};

export const getProducts = async (
  query: GetProductsQuery
): Promise<PaginatedProductsResponse> => {
  const filter: any = {};

  if (query.merchantId) {
    if (!mongoose.Types.ObjectId.isValid(query.merchantId)) {
      throw new AppError("Invalid Merchant ID format", 400);
    }
    filter.merchantId = query.merchantId;
  }

  if (query.category) {
    filter.category = query.category;
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.search) {
    filter.name = { $regex: query.search, $options: "i" };
  }

  const page = Math.max(1, parseInt(String(query.page || "1"), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(query.limit || "20"), 10) || 20)
  );
  const skip = (page - 1) * limit;

  const total = await Product.countDocuments(filter);
  const totalPages = Math.ceil(total / limit) || 1;

  const data = await Product.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};

export const updateProduct = async (
  id: string,
  data: Partial<IProduct>
): Promise<IProduct> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Product ID format", 400);
  }

  if (data.merchantId) {
    if (!mongoose.Types.ObjectId.isValid(data.merchantId.toString())) {
      throw new AppError("Invalid Merchant ID format", 400);
    }
    const merchantExists = await Merchant.exists({ _id: data.merchantId });
    if (!merchantExists) {
      throw new AppError("Merchant not found", 404);
    }
  }

  if (data.sku) {
    const existingSku = await Product.findOne({
      sku: data.sku.toUpperCase(),
      _id: { $ne: id },
    });
    if (existingSku) {
      throw new AppError("Product with this SKU already exists", 409);
    }
  }

  try {
    const updated = await Product.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      throw new AppError("Product not found", 404);
    }

    return updated;
  } catch (error: any) {
    if (error.code === 11000) {
      throw new AppError("Product with this SKU already exists", 409);
    }
    throw error;
  }
};

export const deleteProduct = async (id: string): Promise<IProduct> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Product ID format", 400);
  }

  const deleted = await Product.findByIdAndDelete(id);
  if (!deleted) {
    throw new AppError("Product not found", 404);
  }

  return deleted;
};
