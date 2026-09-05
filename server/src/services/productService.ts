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
  /** Structured attributes from the product's specifications map. */
  specifications?: Record<string, string | number | boolean>;
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

// ─────────────────────────────────────────────────────────
// CANONICAL ATTRIBUTE ALIAS MAP
// Generic normalization — no category-specific or brand-specific logic.
// Maps common synonym/variant forms to canonical attribute names.
// Extend this map as the platform grows; do not add product-type-specific entries.
// ─────────────────────────────────────────────────────────
const ATTRIBUTE_ALIASES: Record<string, string> = {
  colour: "color",
  make: "brand",
  manufacturer: "brand",
  "brand name": "brand",
  disk: "storage",
  "ssd capacity": "storage",
  "ssd storage": "storage",
  hdd: "storage",
  "hard disk": "storage",
  "disk space": "storage",
  "screen size": "screensize",
  "display size": "screensize",
};

/**
 * Normalize an attribute key to canonical form.
 * Handles case, whitespace/separator variants, and synonym aliases generically.
 * Works across ALL product categories — no category-specific logic.
 *
 * Examples:
 *   "colour"          → "color"
 *   "make"            → "brand"
 *   "BRAND"           → "brand"
 *   "adjustable-height" → "adjustableheight"
 *   "SSD Capacity"    → "storage"
 */
export const normalizeAttributeKey = (key: string): string => {
  const normalized = key
    .replace(/[\s_-]+/g, " ")
    .toLowerCase()
    .trim();
  const aliased = ATTRIBUTE_ALIASES[normalized];
  if (aliased) return aliased;
  // Remove spaces for compound/camelCase keys: "adjustable height" → "adjustableheight"
  return normalized.replace(/\s+/g, "");
};

/**
 * Look up a value from a product's specifications Map using normalized key matching.
 * Tries canonical-normalized key first, then raw key (case-insensitive).
 */
const getSpecValue = (
  specs: Map<string, string | number | boolean>,
  normalizedKey: string,
  rawKey: string
): string | number | boolean | undefined => {
  for (const [k, v] of specs.entries()) {
    if (normalizeAttributeKey(k) === normalizedKey) return v;
  }
  const rawLower = rawKey.toLowerCase();
  for (const [k, v] of specs.entries()) {
    if (k.toLowerCase() === rawLower) return v;
  }
  return undefined;
};

/**
 * Match a catalog specification value against a buyer requirement value.
 * Supports:
 *   - Booleans: true/yes/false/no
 *   - Numbers: exact numeric equality
 *   - Strings: case-insensitive, substring (handles multi-word values like "MacBook Pro")
 * No type-specific or brand-specific handling.
 */
const matchesSpecValue = (
  specValue: string | number | boolean,
  reqValue: string | number | boolean
): boolean => {
  const reqStr = String(reqValue).toLowerCase().trim();

  // Boolean requirement ("true", "yes", true)
  if (reqValue === true || reqStr === "true" || reqStr === "yes") {
    if (typeof specValue === "boolean") return specValue === true;
    const sv = String(specValue).toLowerCase().trim();
    return sv === "true" || sv === "yes";
  }

  // Exact numeric comparison
  if (typeof reqValue === "number" && typeof specValue === "number") {
    return specValue === reqValue;
  }

  // String: case-insensitive with substring support
  // Supports multi-word values: "MacBook Pro", "video editing", "running shoes"
  const specStr = String(specValue).toLowerCase().trim();
  return specStr === reqStr || specStr.includes(reqStr) || reqStr.includes(specStr);
};

/**
 * Legacy text fallback: check if a requirement is represented in the product's
 * name, description, category, or tags as free text.
 *
 * Used ONLY when the product has no structured specification entry for that key.
 * This preserves backward compatibility with products that pre-date the specifications field.
 */
const matchesTextFallback = (
  fullText: string,
  normalizedKey: string,
  value: string | number | boolean
): boolean => {
  const reqStr = String(value).toLowerCase().trim();

  if (value === true || reqStr === "true" || reqStr === "yes") {
    // Boolean: check if the attribute key name appears in text
    const readable = normalizedKey
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase();
    return fullText.includes(readable);
  }

  // Value string check
  return fullText.includes(reqStr);
};

export const toPublicProduct = (product: IProduct): PublicProduct => {
  let mId = "";
  if (product.merchantId) {
    mId =
      typeof product.merchantId === "object" && (product.merchantId as any)._id
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
    imageUrl: product.imageUrl || (product as any).image || undefined,
    isNegotiable: product.isNegotiable,
    specifications: product.specifications
      ? Object.fromEntries(product.specifications.entries())
      : undefined,
  };
};

/**
 * @deprecated Do not use as a production authorization allowlist.
 * Kept only for backward compatibility with utility/unit tests.
 * For production catalog capability detection use getDynamicSupportedKeys().
 */
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

/**
 * Returns static catalog capabilities for utility/unit-test use.
 * NOT used in the production search path.
 * For production catalog capability detection, use getDynamicSupportedKeys().
 */
export const getCatalogCapabilities = (): CatalogCapabilities => {
  return {
    supportedHardKeys: SUPPORTED_HARD_REQUIREMENT_KEYS,
    searchableFields: ["name", "description", "category", "tags", "specifications"],
  };
};

/**
 * Dynamically detect which specification attribute keys exist in the current catalog.
 * Returns canonical (normalized) key names found across active products' specifications.
 *
 * NO static allowlist — entirely driven by actual catalog data.
 * Works for any category: Electronics, Fashion, Furniture, Groceries, etc.
 *
 * @param merchantId - Optional. Scope to a specific merchant's catalog.
 */
export const getDynamicSupportedKeys = async (
  merchantId?: string
): Promise<Set<string>> => {
  const filter: any = { status: "active" };
  if (merchantId && mongoose.Types.ObjectId.isValid(merchantId)) {
    filter.merchantId = merchantId;
  }

  const products = await Product.find(filter, { specifications: 1 }).lean();
  const keys = new Set<string>();

  for (const product of products) {
    const specs = (product as any).specifications;
    if (specs && typeof specs === "object") {
      for (const key of Object.keys(specs)) {
        keys.add(normalizeAttributeKey(key));
      }
    }
  }

  return keys;
};

/**
 * Utility: validate and classify requirements against a static capabilities set.
 *
 * NOTE: This function is NOT called in the production search path.
 * searchProducts() uses dynamic spec-first matching instead.
 * This function is kept for utility/test use only.
 */
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
    limit: rawLimit,
    sortBy = "relevance",
  } = params;

  // ── Validation ──────────────────────────────────────────
  if (
    minPrice !== undefined &&
    (typeof minPrice !== "number" || minPrice < 0 || isNaN(minPrice))
  ) {
    throw new AppCustomError(
      "INVALID_SEARCH_PARAMS",
      "minPrice must be a non-negative number.",
      400
    );
  }

  if (
    maxPrice !== undefined &&
    (typeof maxPrice !== "number" || maxPrice < 0 || isNaN(maxPrice))
  ) {
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

  // ── MongoDB filter construction ──────────────────────────
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
    return str
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => {
        if (
          /(?:ss|is|us|as|os|yes|this|glass|dress|business|less|mass|boss|cross|furniture)$/i.test(
            t
          )
        )
          return t;
        if (t.length > 3 && t.endsWith("s")) return t.slice(0, -1);
        return t;
      });
  };

  if (query && query.trim().length > 0) {
    const tokens = tokenize(query);
    if (tokens.length > 0) {
      filter.$and = tokens.map((token) => {
        const tRegex = new RegExp(escapeRegex(token), "i");
        return {
          $or: [
            { name: tRegex },
            { description: tRegex },
            { category: tRegex },
            { tags: tRegex },
          ],
        };
      });
    }
  }

  // ── Fetch candidates ─────────────────────────────────────
  console.log("Searching MongoDB with filter:", JSON.stringify(filter));
  let rawProducts = await Product.find(filter);
  console.log("MongoDB returned items:", rawProducts.length);

  // ─────────────────────────────────────────────────────────
  // HARD REQUIREMENT FILTERING
  // Generic, data-driven matching — no category/brand-specific logic.
  //
  // Architecture (per requirement key):
  //   1. Structural specification match (primary, definitive)
  //      If product.specifications has the key → match value structurally.
  //      If spec exists but value mismatches → product EXCLUDED (no fallback).
  //   2. Legacy text fallback
  //      If product has NO spec entry for this key →
  //      check name + description + category + tags for the value.
  //      This preserves backward compat with pre-specifications products.
  //
  // Key normalization is applied generically (colour→color, make→brand, etc.)
  // ─────────────────────────────────────────────────────────
  const rawHardInput = params.hardRequirements || params.requirements || {};
  const hardEntries = Object.entries(rawHardInput);

  if (hardEntries.length > 0) {
    rawProducts = rawProducts.filter((p) => {
      const specMap = p.specifications;
      const fullText =
        `${p.name} ${p.description} ${p.category} ${(p.tags || []).join(" ")}`.toLowerCase();

      return hardEntries.every(([rawKey, value]) => {
        // false means "must NOT have" — skip (not yet a use-case)
        if (value === false) return true;

        const normalizedKey = normalizeAttributeKey(rawKey);

        // 1. Structural specification match (primary)
        if (specMap && specMap.size > 0) {
          const specValue = getSpecValue(specMap, normalizedKey, rawKey);
          if (specValue !== undefined) {
            // Spec found → definitive answer from spec only
            // A spec mismatch cannot be rescued by text fallback
            return matchesSpecValue(specValue, value);
          }
        }

        // 2. Legacy text fallback (product predates structured specifications)
        return matchesTextFallback(fullText, normalizedKey, value);
      });
    });
  }

  const total = rawProducts.length;

  // ── Sorting & relevance ranking ──────────────────────────
  if (sortBy === "price_asc") {
    rawProducts.sort((a, b) => a.price - b.price);
  } else if (sortBy === "price_desc") {
    rawProducts.sort((a, b) => b.price - a.price);
  } else {
    // Relevance scoring
    const catStr = (category || "").trim().toLowerCase();
    const exactQuery = (query || "").trim().toLowerCase();
    const softEntries = Object.entries(
      params.softPreferences || params.preferences || {}
    );

    const scored = rawProducts.map((p) => {
      let score = 0;
      const nameLower = p.name.toLowerCase();
      const descLower = p.description.toLowerCase();
      const catLower = p.category.toLowerCase();
      const specMap = p.specifications;

      // Query match scoring
      if (exactQuery) {
        if (nameLower === exactQuery) score += 100;
        else if (nameLower.includes(exactQuery)) score += 50;
        if (catLower.includes(exactQuery)) score += 30;
        if (descLower.includes(exactQuery)) score += 10;
      }

      // Category match scoring
      if (catStr && catLower.includes(catStr)) {
        score += 40;
      }

      // Inventory presence
      if (p.inventory > 0) score += 5;

      // ── Soft preference relevance boost ──────────────────
      // Spec-first: full boost when structured spec matches.
      // Text fallback: partial boost when value appears in text.
      // Neither filters out products — soft prefs only influence ranking.
      if (softEntries.length > 0) {
        const textForSoft =
          `${p.name} ${p.description} ${(p.tags || []).join(" ")}`.toLowerCase();

        for (const [rawKey, sVal] of softEntries) {
          if (sVal === false) continue;
          const normalizedKey = normalizeAttributeKey(rawKey);

          // Spec match: full boost
          if (specMap && specMap.size > 0) {
            const specValue = getSpecValue(specMap, normalizedKey, rawKey);
            if (specValue !== undefined) {
              if (matchesSpecValue(specValue, sVal)) score += 15;
              // Don't also check text if a spec entry exists for this key
              continue;
            }
          }

          // Text fallback boost (legacy products)
          const keyTerms = rawKey
            .replace(/([A-Z])/g, " $1")
            .trim()
            .toLowerCase()
            .split(/\s+/);
          const valTerms =
            typeof sVal === "string" ? sVal.toLowerCase().split(/\s+/) : [];
          const terms = [...keyTerms, ...valTerms].filter((t) => t.length > 2);
          for (const term of terms) {
            if (textForSoft.includes(term)) {
              score += 10;
              break;
            }
          }
        }
      }

      return { product: p, score };
    });

    console.log("Scores computed. Sorting...", scored.length);
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        b.product.createdAt.getTime() - a.product.createdAt.getTime()
    );
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
      requirements: rawHardInput,
      hardRequirements: rawHardInput,
      softPreferences: params.softPreferences || params.preferences || {},
      limit,
      sortBy,
    },
  };
};

export const createProduct = async (data: Partial<IProduct>): Promise<IProduct> => {
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

  if ((data as any).image && !data.imageUrl) {
    data.imageUrl = (data as any).image;
  } else if (data.imageUrl && !(data as any).image) {
    (data as any).image = data.imageUrl;
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

  const { merchantId: _ignoredMerchantId, ...safeData } = data as Partial<IProduct> & {
    merchantId?: unknown;
  };

  if (safeData.sku) {
    const existingSku = await Product.findOne({
      sku: safeData.sku.toUpperCase(),
      _id: { $ne: id },
    });
    if (existingSku) {
      throw new AppError("Product with this SKU already exists", 409);
    }
  }

  if ((safeData as any).image !== undefined && safeData.imageUrl === undefined) {
    safeData.imageUrl = (safeData as any).image;
  } else if (safeData.imageUrl !== undefined && (safeData as any).image === undefined) {
    (safeData as any).image = safeData.imageUrl;
  }

  try {
    const updated = await Product.findByIdAndUpdate(id, safeData, {
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
