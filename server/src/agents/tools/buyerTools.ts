import { Type, type FunctionDeclaration } from "@google/genai";
import {
  searchProducts,
  getProductById,
  toPublicProduct,
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
  description:
    "Search connected merchant products using buyer requirements such as product name, category, price range, quantity, specifications, inventory, and sorting.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description:
          "The main product or keyword the buyer is looking for. Example: 'laptop', 'office chair', 'gaming monitor'.",
      },
      category: {
        type: Type.STRING,
        description:
          "Product category when the buyer specifies or clearly implies one. Example: 'Laptop', 'Office Furniture'.",
      },
      minPrice: {
        type: Type.NUMBER,
        description:
          "Minimum acceptable product price in INR. Use only when the buyer explicitly requests a minimum or says 'above', 'over', or 'at least'.",
      },
      maxPrice: {
        type: Type.NUMBER,
        description:
          "Maximum acceptable product price in INR. Use when the buyer says 'under', 'below', 'less than', 'maximum', or 'at most'.",
      },
      quantity: {
        type: Type.NUMBER,
        description:
          "Number of units the buyer wants to purchase. Example: '10 chairs' means quantity = 10.",
      },
      minInventory: {
        type: Type.NUMBER,
        description:
          "Minimum inventory required for a product to be considered available.",
      },
      requirements: {
        type: Type.OBJECT,
        description:
          "Required product specifications explicitly requested by the buyer. Example: { 'ram': '16GB', 'storage': '512GB SSD' }.",
      },
      limit: {
        type: Type.NUMBER,
        description:
          "Maximum number of products to return. Must be between 1 and 20. Default to 5 when the buyer does not specify a number.",
      },
      sortBy: {
        type: Type.STRING,
        enum: ["relevance", "price_asc", "price_desc"],
        description:
          "Use price_asc when the buyer asks for the cheapest/lowest-priced options, price_desc when the buyer asks for the most expensive options, otherwise relevance.",
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

export const getProductDetailsToolDeclaration: FunctionDeclaration = {
  name: "getProductDetails",
  description:
    "Retrieve complete buyer-safe details for a specific product ID selected by the buyer.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      productId: {
        type: Type.STRING,
        description: "The unique MongoDB product ID to fetch details for.",
      },
    },
    required: ["productId"],
  },
};

export const getProductDetailsTool = async (
  productId: string
): Promise<{ success: boolean; product: PublicProduct }> => {
  console.log(`[BUYER_AGENT] Tool: getProductDetails for productId=${productId}`);
  try {
    const rawProduct = await getProductById(productId);
    const publicProduct = toPublicProduct(rawProduct);
    return {
      success: true,
      product: publicProduct,
    };
  } catch (error: any) {
    console.error("[BUYER_AGENT] Tool Error in getProductDetails:", error.message || error);
    throw error;
  }
};

import {
  startNegotiation,
  submitBuyerOffer,
  AppCustomError,
} from "../../services/negotiationService.js";
import { calculateEconomicOffer, roundPercent } from "../../services/economicEngine.js";
import { createAuditEvent } from "../../services/auditService.js";
import Policy from "../../models/Policy.js";

export interface StartNegotiationToolInput {
  productId: string;
  quantity?: number;
}

export interface StartNegotiationToolOutput {
  success: boolean;
  negotiation: {
    id: string;
    status: string;
    productId: string;
    productName: string;
    quantity: number;
    originalUnitPrice: number;
    currentOffer: number;
    currency: string;
    round: number;
    maxRounds: number;
  };
}

export const startNegotiationToolDeclaration: FunctionDeclaration = {
  name: "startNegotiation",
  description:
    "Initiate price negotiation for a selected product with merchant policy enforcement.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      productId: {
        type: Type.STRING,
        description: "The unique MongoDB product ID to negotiate for.",
      },
      quantity: {
        type: Type.NUMBER,
        description: "The quantity of items to negotiate for (default 1).",
      },
    },
    required: ["productId"],
  },
};

export const startNegotiationTool = async (
  input: StartNegotiationToolInput
): Promise<StartNegotiationToolOutput> => {
  const { productId, quantity = 1 } = input;
  console.log(`[BUYER_AGENT] Tool: startNegotiation for productId=${productId}, qty=${quantity}`);

  const rawProduct = await getProductById(productId);
  if (!rawProduct) {
    throw new AppCustomError("PRODUCT_NOT_FOUND", "The selected product is no longer available.", 404);
  }

  if (rawProduct.isNegotiable === false) {
    throw new AppCustomError("NEGOTIATION_NOT_AVAILABLE", "This product is not currently negotiable.", 400);
  }

  if (rawProduct.inventory < quantity) {
    throw new AppCustomError(
      "INSUFFICIENT_INVENTORY",
      `Only ${rawProduct.inventory} units are currently available.`,
      400
    );
  }

  const merchantIdStr = rawProduct.merchantId?._id
    ? rawProduct.merchantId._id.toString()
    : rawProduct.merchantId.toString();

  const policy = await Policy.findOne({ merchantId: merchantIdStr, isActive: true });
  if (!policy || !policy.negotiationEnabled) {
    throw new AppCustomError("NEGOTIATION_NOT_AVAILABLE", "Negotiation is disabled for this merchant.", 400);
  }

  const negotiation = await startNegotiation({
    merchantId: merchantIdStr,
    productId: rawProduct._id.toString(),
    policyId: policy._id.toString(),
    quantity,
    currency: rawProduct.currency,
  });

  const economicResult = calculateEconomicOffer({
    product: rawProduct,
    policy,
    quantity,
  });

  const initialOffer = economicResult.recommendedCounterOfferUnitPrice;
  negotiation.currentMerchantOffer = initialOffer;
  negotiation.currentDiscountPercent = roundPercent(
    ((rawProduct.price - initialOffer) / rawProduct.price) * 100
  );
  negotiation.currentMarginPercent = roundPercent(
    ((initialOffer - rawProduct.costPrice) / initialOffer) * 100
  );
  await negotiation.save();

  await createAuditEvent({
    merchantId: merchantIdStr,
    negotiationId: negotiation._id,
    eventType: "NEGOTIATION_STARTED",
    actorType: "BUYER",
    description: `Buyer initiated negotiation for ${rawProduct.name} (Qty: ${quantity})`,
  });

  await createAuditEvent({
    merchantId: merchantIdStr,
    negotiationId: negotiation._id,
    eventType: "MERCHANT_COUNTER_OFFERED",
    actorType: "SYSTEM",
    description: `Merchant counter offered unit price of ${rawProduct.currency} ${initialOffer}`,
  });

  return {
    success: true,
    negotiation: {
      id: negotiation._id.toString(),
      status: negotiation.status,
      productId: rawProduct._id.toString(),
      productName: rawProduct.name,
      quantity: negotiation.quantity,
      originalUnitPrice: rawProduct.price,
      currentOffer: initialOffer,
      currency: negotiation.currency,
      round: negotiation.currentRound,
      maxRounds: negotiation.maxRounds,
    },
  };
};

export const submitBuyerOfferToolDeclaration: FunctionDeclaration = {
  name: "submitBuyerOffer",
  description: "Submit a target buyer price offer for an active negotiation session.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      negotiationId: {
        type: Type.STRING,
        description: "The unique MongoDB negotiation ID.",
      },
      buyerOffer: {
        type: Type.NUMBER,
        description: "The price offered by the buyer per unit.",
      },
    },
    required: ["negotiationId", "buyerOffer"],
  },
};

export const submitBuyerOfferTool = async (
  negotiationId: string,
  buyerOffer: number
) => {
  console.log(`[BUYER_AGENT] Tool: submitBuyerOffer for negotiationId=${negotiationId}, offer=${buyerOffer}`);

  const res = await submitBuyerOffer(negotiationId, buyerOffer);

  // Load negotiation model directly for merchantId
  const NegotiationModel = (await import("../../models/Negotiation.js")).default;
  const neg = await NegotiationModel.findById(negotiationId);

  if (neg) {
    await createAuditEvent({
      merchantId: neg.merchantId,
      negotiationId: neg._id,
      eventType: "BUYER_OFFER_SUBMITTED",
      actorType: "BUYER",
      description: `Buyer submitted offer of ${neg.currency} ${buyerOffer}`,
    });

    if (res.decision === "ACCEPT") {
      await createAuditEvent({
        merchantId: neg.merchantId,
        negotiationId: neg._id,
        eventType: "NEGOTIATION_ACCEPTED",
        actorType: "SYSTEM",
        description: `Negotiation accepted at ${neg.currency} ${res.acceptedPrice}`,
      });
    } else if (res.decision === "COUNTER_OFFER") {
      await createAuditEvent({
        merchantId: neg.merchantId,
        negotiationId: neg._id,
        eventType: "MERCHANT_COUNTER_OFFERED",
        actorType: "SYSTEM",
        description: `Merchant counter offered unit price of ${neg.currency} ${res.merchantCounterOffer}`,
      });
    } else if (res.decision === "REJECT") {
      await createAuditEvent({
        merchantId: neg.merchantId,
        negotiationId: neg._id,
        eventType: "NEGOTIATION_REJECTED",
        actorType: "SYSTEM",
        description: `Negotiation rejected by merchant policy.`,
      });
    } else if (res.decision === "EXPIRED") {
      await createAuditEvent({
        merchantId: neg.merchantId,
        negotiationId: neg._id,
        eventType: "NEGOTIATION_EXPIRED",
        actorType: "SYSTEM",
        description: `Negotiation expired due to max rounds limit.`,
      });
    }
  }

  return res;
};
