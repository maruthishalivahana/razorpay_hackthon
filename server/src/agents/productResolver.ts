import type { PublicProduct } from "../services/productService.js";
import type { BuyerState } from "./buyerState.js";
import { parseIndianPrice } from "./intentNormalizer.js";

export interface SelectionResultSuccess {
  success: true;
  selectedProductId: string;
  selectedProductName: string;
  product: PublicProduct;
}

export interface SelectionResultError {
  success: false;
  code:
  | "PRODUCT_REFERENCE_INVALID"
  | "PRODUCT_REFERENCE_AMBIGUOUS"
  | "NO_SEARCH_RESULTS"
  | "NO_SELECTED_PRODUCT";
  message: string;
}

export type SelectionResult = SelectionResultSuccess | SelectionResultError;

export const parseOrdinalIndex = (text: string): number | null => {
  const clean = text
    .toLowerCase()
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const wordMap: Record<string, number> = {
    first: 1,
    "1st": 1,
    second: 2,
    "2nd": 2,
    third: 3,
    "3rd": 3,
    fourth: 4,
    "4th": 4,
    fifth: 5,
    "5th": 5,
    sixth: 6,
    "6th": 6,
    seventh: 7,
    "7th": 7,
    eighth: 8,
    "8th": 8,
    ninth: 9,
    "9th": 9,
    tenth: 10,
    "10th": 10,
    "option one": 1,
    "option two": 2,
    "option three": 3,
    "option four": 4,
    "option five": 5,
    "number one": 1,
    "number two": 2,
    "number three": 3,
    "number four": 4,
    "number five": 5,
  };

  for (const [word, idx] of Object.entries(wordMap)) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(clean)) {
      return idx;
    }
  }

  const match = clean.match(/(?:option|number|#|no\.?)\s*(\d+)/i) || clean.match(/\b(\d+)(st|nd|rd|th)\b/i);
  if (match) {
    const num = parseInt(match[1], 10);
    if (Number.isFinite(num) && num > 0) {
      return num;
    }
  }

  return null;
};

export const selectProductFromSearchResults = (
  reference: string | number,
  currentState: BuyerState,
  candidateProducts: PublicProduct[] = []
): SelectionResult => {
  const products = candidateProducts.length > 0 ? candidateProducts : currentState.lastProducts;

  if (!products || products.length === 0) {
    return {
      success: false,
      code: "NO_SEARCH_RESULTS",
      message: "There are no search results in the current context to select from.",
    };
  }

  const refStr = String(reference).trim().toLowerCase();

  if (typeof reference === "number") {
    if (reference < 1 || reference > products.length) {
      return {
        success: false,
        code: "PRODUCT_REFERENCE_INVALID",
        message: `There are only ${products.length} products in the current search results.`,
      };
    }
    const selected = products[reference - 1];
    return {
      success: true,
      selectedProductId: selected.id,
      selectedProductName: selected.name,
      product: selected,
    };
  }

  // 1. Ordinal / Numerical Index (e.g. "first", "2", "option 3", "last", "middle")
  if (refStr === "last" || refStr === "the last one" || refStr === "last one" || refStr === "the last product") {
    const lastProduct = products[products.length - 1];
    return {
      success: true,
      selectedProductId: lastProduct.id,
      selectedProductName: lastProduct.name,
      product: lastProduct,
    };
  }

  if (/(?:the\s+one\s+in\s+the\s+middle|middle\s+one|middle\s+option|in\s+the\s+middle|middle\s+product)/i.test(refStr)) {
    const middleIdx = Math.max(0, Math.ceil(products.length / 2) - 1);
    const middleProduct = products[middleIdx];
    return {
      success: true,
      selectedProductId: middleProduct.id,
      selectedProductName: middleProduct.name,
      product: middleProduct,
    };
  }

  const ordinalIdx = parseOrdinalIndex(refStr);
  if (ordinalIdx !== null) {
    if (ordinalIdx < 1 || ordinalIdx > products.length) {
      return {
        success: false,
        code: "PRODUCT_REFERENCE_INVALID",
        message: `There are only ${products.length} products in the current search results.`,
      };
    }

    const selected = products[ordinalIdx - 1];
    return {
      success: true,
      selectedProductId: selected.id,
      selectedProductName: selected.name,
      product: selected,
    };
  }

  // 2. "cheapest" / "lowest price"
  if (/(cheapest|lowest price)/i.test(refStr)) {
    const sortedByPrice = [...products].sort((a, b) => a.price - b.price);
    const cheapest = sortedByPrice[0];
    return {
      success: true,
      selectedProductId: cheapest.id,
      selectedProductName: cheapest.name,
      product: cheapest,
    };
  }

  // 3. "most expensive" / "highest price"
  if (/(most expensive|highest price)/i.test(refStr)) {
    const sortedByPrice = [...products].sort((a, b) => b.price - a.price);
    const expensive = sortedByPrice[0];
    return {
      success: true,
      selectedProductId: expensive.id,
      selectedProductName: expensive.name,
      product: expensive,
    };
  }

  // 4. Price reference (e.g. "the one at ₹8,500", "at ₹8500", "8500")
  let priceValue: number | null = null;

  // Try to extract price from "at ₹X" or "at X" format
  const priceMatch = refStr.match(/(?:at|₹|rs)\s*₹?\s*([\d,.\s]+(?:\s*(?:k|thousand|lakh|lakhs|l|crore|crores))?)/i);
  if (priceMatch) {
    priceValue = parseIndianPrice(priceMatch[1].trim());
  } else {
    // Try parsing the whole reference as a price
    priceValue = parseIndianPrice(refStr);
  }

  if (priceValue !== null && /\d/.test(refStr)) {
    const priceMatches = products.filter((p) => p.price === priceValue);
    if (priceMatches.length === 1) {
      const selected = priceMatches[0];
      return {
        success: true,
        selectedProductId: selected.id,
        selectedProductName: selected.name,
        product: selected,
      };
    }
    if (priceMatches.length > 1) {
      return {
        success: false,
        code: "PRODUCT_REFERENCE_AMBIGUOUS",
        message: `Multiple products match price ₹${priceValue.toLocaleString("en-IN")}. Please specify by option number.`,
      };
    }
  }

  // 5. Contextual Demonstratives ("that one", "this one", "that", "this", "it")
  const lowerRef = refStr.replace(/^(?:the|i\s+want|select|buy|choose|show\s+me|i'll\s+go\s+with|lets\s+go\s+with|let's\s+go\s+with|take|go\s+with)\s+/i, "").trim();
  const isDemonstrative = /^(?:that\s+one|this\s+one|that|this|it|that\s+product|this\s+product)$/i.test(lowerRef) || /^(?:that\s+one|this\s+one|that|this|it)$/i.test(refStr);

  if (isDemonstrative) {
    if (currentState.selectedProductId) {
      const selected = products.find((p) => p.id === currentState.selectedProductId);
      if (selected) {
        return {
          success: true,
          selectedProductId: selected.id,
          selectedProductName: selected.name,
          product: selected,
        };
      }
    }
    if (products.length === 1) {
      const selected = products[0];
      return {
        success: true,
        selectedProductId: selected.id,
        selectedProductName: selected.name,
        product: selected,
      };
    }
    return {
      success: false,
      code: "PRODUCT_REFERENCE_AMBIGUOUS",
      message: `There are ${products.length} options available. Which one did you mean? (e.g. the first or second option)`,
    };
  }

  // 6. Product Name / Text Reference
  if (lowerRef.length > 0) {
    // Exact name match
    const exactName = products.filter((p) => p.name.toLowerCase() === lowerRef);
    if (exactName.length === 1) {
      return {
        success: true,
        selectedProductId: exactName[0].id,
        selectedProductName: exactName[0].name,
        product: exactName[0],
      };
    }

    // Substring name / description / tag match
    const partialMatches = products.filter((p) => {
      const nameL = p.name.toLowerCase();
      const descL = p.description.toLowerCase();
      const catL = p.category.toLowerCase();
      return nameL.includes(lowerRef) || descL.includes(lowerRef) || catL.includes(lowerRef);
    });

    if (partialMatches.length === 1) {
      const selected = partialMatches[0];
      return {
        success: true,
        selectedProductId: selected.id,
        selectedProductName: selected.name,
        product: selected,
      };
    }

    if (partialMatches.length > 1) {
      return {
        success: false,
        code: "PRODUCT_REFERENCE_AMBIGUOUS",
        message: `Multiple products match "${reference}". Please specify by option number (e.g. the first or second option).`,
      };
    }
  }

  // 7. Ambiguous / Unresolved reference
  return {
    success: false,
    code: "PRODUCT_REFERENCE_AMBIGUOUS",
    message: "Which product would you like? You can say the first, second, or third option.",
  };
};
