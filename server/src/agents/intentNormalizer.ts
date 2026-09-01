import type { BuyerState, BuyerIntent, IntentType, CommerceQueryKind } from "./buyerState.js";
import type { ConversationTurn } from "./buyerAgent.js";
import type { LLMProvider } from "../llm/llmProvider.js";
import { parseOrdinalIndex } from "./productResolver.js";
import { validateCatalogRequirements } from "../services/productService.js";

const validIntentTypes: IntentType[] = [
  "NEW_SEARCH",
  "UPDATE_SEARCH",
  "SELECT_PRODUCT",
  "PRODUCT_DETAILS",
  "START_NEGOTIATION",
  "CONTINUE_NEGOTIATION",
  "BUYER_OFFER",
  "ACCEPT_NEGOTIATION",
  "REQUEST_FREE_DELIVERY",
  "PLACE_ORDER",
  "COMMERCE_QUERY",
  "CLARIFICATION_REQUIRED",
  "OUT_OF_SCOPE",
];

const allowedUpdateKeys = new Set([
  "topic",
  "category",
  "minPrice",
  "maxPrice",
  "quantity",
  "sortBy",
  "requirements",
  "hardRequirements",
  "softPreferences",
  "selectedProductIndex",
  "selectedProductReference",
  "selectedProductId",
  "selectedProductName",
  "searchResults",
  "negotiationId",
  "negotiationStatus",
  "buyerOffer",
  "requestedFreeDelivery",
  "query",
]);

const allowedClearFields = new Set([
  "topic",
  "category",
  "minPrice",
  "maxPrice",
  "quantity",
  "sortBy",
  "requirements",
  "hardRequirements",
  "softPreferences",
  "lastQuery",
  "selectedProductId",
  "selectedProductName",
  "searchResults",
  "negotiationId",
  "negotiationStatus",
]);

export const buildIntentSystemInstruction = (): string => `
You are an intent extraction engine for a product discovery commerce platform.
Your job is to analyse the buyer's latest message in context of the session state and produce a JSON intent object.

Output ONLY valid JSON matching this schema:
{
  "type": "NEW_SEARCH" | "UPDATE_SEARCH" | "SELECT_PRODUCT" | "PRODUCT_DETAILS" | "START_NEGOTIATION" | "CONTINUE_NEGOTIATION" | "CLARIFICATION_REQUIRED" | "OUT_OF_SCOPE",
  "updates": {
    "topic": string | null,
    "category": string | null,
    "minPrice": number | null,
    "maxPrice": number | null,
    "quantity": number | null,
    "sortBy": "relevance" | "price_asc" | "price_desc",
    "requirements": Record<string, string | number | boolean>,
    "selectedProductIndex": number | null,
    "selectedProductReference": string | null,
    "buyerOffer": number | null
  },
  "clearFields": string[],
  "clarificationQuestion": string | null,
  "outOfScopeMessage": string | null
}

Examples:
- "I want an office chair" -> { "type": "NEW_SEARCH", "updates": { "topic": "office chair" } }
- "Under ₹18k" -> { "type": "UPDATE_SEARCH", "updates": { "maxPrice": 18000 } }
- "I need 5" -> { "type": "UPDATE_SEARCH", "updates": { "quantity": 5 } }
- "It should be ergonomic with adjustable height" -> { "type": "UPDATE_SEARCH", "updates": { "requirements": { "ergonomic": true, "adjustableHeight": true } } }
- "I want the second one" -> { "type": "SELECT_PRODUCT", "updates": { "selectedProductIndex": 2 } }
- "I'll take the cheapest" -> { "type": "SELECT_PRODUCT", "updates": { "selectedProductReference": "cheapest" } }
- "Tell me more about it" -> { "type": "PRODUCT_DETAILS" }
- "Can you give me a better price?" -> { "type": "START_NEGOTIATION" }
- "Can you do better?" -> { "type": "CONTINUE_NEGOTIATION" }
- "I can pay 8500" -> { "type": "CONTINUE_NEGOTIATION", "updates": { "buyerOffer": 8500 } }
- "Start over" -> { "type": "NEW_SEARCH", "updates": { "topic": null, "maxPrice": null }, "clearFields": ["topic", "maxPrice", "selectedProductId"] }
`.trim();

export const buildStateContext = (state: BuyerState): string => {
  return [
    "CURRENT SESSION STATE:",
    `  topic: ${state.topic ?? "(none)"}`,
    `  category: ${state.category ?? "(none)"}`,
    `  minPrice: ${state.minPrice ?? "(none)"}`,
    `  maxPrice: ${state.maxPrice ?? "(none)"}`,
    `  quantity: ${state.quantity ?? "(none)"}`,
    `  sortBy: ${state.sortBy}`,
    `  selectedProductId: ${state.selectedProductId ?? "(none)"}`,
    `  selectedProductName: ${state.selectedProductName ?? "(none)"}`,
    `  searchResultsCount: ${state.searchResults.length}`,
    `  requirements: ${Object.keys(state.requirements).length > 0 ? JSON.stringify(state.requirements) : "(none)"}`,
    `  turnCount: ${state.turnCount}`,
  ].join("\n");
};

const numberFromWord = (word: string): number | null => {
  const map: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
  };
  return map[word.toLowerCase()] ?? null;
};

export const parseIndianPrice = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let raw = String(value).trim();
  if (!raw) return null;

  raw = raw.replace(/₹|rs/gi, "").replace(/,/g, "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  const matchers: Array<[RegExp, number]> = [
    [/^(\d+(?:\.\d+)?)\s*(crore|crores)$/i, 10000000],
    [/^(\d+(?:\.\d+)?)\s*(lakh|lakhs|l)$/i, 100000],
    [/^(\d+(?:\.\d+)?)\s*(k|thousand)$/i, 1000],
  ];

  for (const [regex, factor] of matchers) {
    const match = lower.match(regex);
    if (match) {
      const amount = Number.parseFloat(match[1]);
      if (Number.isFinite(amount)) return Math.round(amount * factor);
    }
  }

  const plain = Number.parseFloat(raw);
  if (Number.isFinite(plain) && /^\d+(?:\.\d+)?$/.test(raw.replace(/\s+/g, ""))) return plain;

  return null;
};

export const normalizeTopic = (value: string): string => {
  const text = (value ?? "")
    .toLowerCase()
    .replace(/[.,!?;:()\[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";
  if (/^[\d\s]+$/.test(text)) return "";

  const stripped = text
    .replace(/^(?:show\s+me|find\s+me|look\s+for|search\s+for|i\s+want\s+to\s+buy|i\s+want|i\s+need|need|buy|purchase|find|give\s+me|i'd\s+prefer|i\s+prefer|i'd\s+like|i\s+would\s+like|preferably|ideally|must\s+have|must\s+be|is\s+there|can\s+you\s+find|can\s+you\s+show\s+me)\s+/i, "")
    .replace(/^(?:which\s+one\s+is|which\s+is|what\s+is|what\s+are)\s+/i, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/(?:\b|\s+)(?:under|above|below|between|with|without|for|and|or|make it|cheapest|expensive|price|budget|in|on|at|size|color|colour|black|white|red|blue|grey|gray|green|silver|ram|storage|gb|tb|ssd|hdd|ergonomic|adjustable\s+height|adjustable|lumbar\s+support|comfortable|comfort|working\s+from\s+home|work\s+from\s+home|home\s+workspace|coding|lightweight|camera|long\s+hours|all\s+day|required|preferred|preferably|is\s+required|is\s+preferred)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!stripped) return "";
  if (/^[\d\s]+$/.test(stripped)) return "";
  if (/^(?:which\s+one\s+is|which\s+is|what\s+is|what\s+are)\b/i.test(stripped)) return "";
  if (/^(?:something|anything|item|product)(?:\s+comfortable|\s+cheap|\s+good|\s+lightweight)?$/i.test(stripped)) return "";

  const words = stripped.split(/\s+/).filter(Boolean).map((word) => {
    const base = word.toLowerCase();
    if (base.endsWith("ies") && base.length > 4) return base.slice(0, -3) + "y";
    if (base.endsWith("sses") || base.endsWith("ss") || base.endsWith("us") || base.endsWith("is") || base.endsWith("as")) return base;
    if (base.endsWith("s") && base.length > 3 && !/[0-9]/.test(base)) return base.slice(0, -1);
    return base;
  });

  return words.join(" ");
};

const extractTopicText = (message: string): string => {
  const stripped = message
    .replace(/^(?:actually|instead)\s+/i, "")
    .replace(/^(?:show\s+me|find\s+me|look\s+for|search\s+for|i\s+want\s+to\s+buy|i\s+want|i\s+need|buy|purchase|looking\s+for|find|give\s+me|i'd\s+prefer|i\s+prefer|i'd\s+like|i\s+would\s+like|preferably|ideally|must\s+have|must\s+be)\s+/i, "")
    .replace(/^(?:which\s+one\s+is|which\s+is|what\s+is|what\s+are)\s+/i, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/(?:\b|\s+)(?:under|above|below|between|less than|more than|at most|at least|minimum|maximum|cheapest|most expensive|lowest price|highest price|budget|price|with|without|for|size\s*\d+|ram|storage|gb|tb|ssd|hdd|is\s+required|is\s+preferred)\b.*$/i, "")
    .replace(/[.?!]+$/g, "")
    .trim();

  if (!stripped) return "";
  if (/^[\d\s]+$/.test(stripped)) return "";
  if (!/[a-z]/i.test(stripped)) return "";
  if (/^(?:which\s+one\s+is|which\s+is|what\s+is|what\s+are)\b/i.test(stripped)) return "";
  if (/^(?:something|anything|item|product)(?:\s+comfortable|\s+cheap|\s+good|\s+lightweight)?$/i.test(stripped)) return "";
  return stripped;
};

const parsePriceConstraint = (message: string): { minPrice: number | null; maxPrice: number | null } => {
  const lower = message.toLowerCase().replace(/\s+/g, " ").trim();
  const result = { minPrice: null as number | null, maxPrice: null as number | null };

  const between = lower.match(/between\s*(?:₹|rs)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|l|lakh|lakhs|crore|crores)?\s*(?:and|to)\s*(?:₹|rs)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|l|lakh|lakhs|crore|crores)?/i);
  if (between) {
    const a = parseIndianPrice(`${between[1]} ${between[2] ?? ""}`.trim());
    const b = parseIndianPrice(`${between[3]} ${between[4] ?? ""}`.trim());
    if (a !== null) result.minPrice = a;
    if (b !== null) result.maxPrice = b;
    return result;
  }

  const max = lower.match(/(?:under|below|less than|at most|maximum|max|up to|make it)\s*(?:₹|rs)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|l|lakh|lakhs|crore|crores)?/i);
  if (max) {
    const parsed = parseIndianPrice(`${max[1]} ${max[2] ?? ""}`.trim());
    if (parsed !== null) result.maxPrice = parsed;
  }

  const min = lower.match(/(?:above|over|more than|at least|minimum|min)\s*(?:₹|rs)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|l|lakh|lakhs|crore|crores)?/i);
  if (min) {
    const parsed = parseIndianPrice(`${min[1]} ${min[2] ?? ""}`.trim());
    if (parsed !== null) result.minPrice = parsed;
  }

  return result;
};

const parseQuantity = (message: string): number | null => {
  const patterns = [
    /(\d+)\s*(?:units?|pieces?|pcs|items?|chairs?|laptops?|desks?|tables?|monitors?|phones?|mugs?|fans?|of them)\b/i,
    /(?:need|buy|want|quantity|qty|looking for|for)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i,
    /^(?:i\s+need|i\s+want|buy|purchase)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i,
    /\b(\d+)\s*(?:units?|pieces?|pcs|items?|chairs?|laptops?)\b/i,
    /\b(?:for|need|want)\s+(\d+)\b/i,
  ];

  for (const regex of patterns) {
    const match = message.match(regex);
    if (!match) continue;
    const token = match[1] ?? "";
    const asNumber = Number.parseInt(token, 10);
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
    const wordNumber = numberFromWord(token);
    if (wordNumber !== null && wordNumber > 0) return wordNumber;
  }

  return null;
};

const parseDiscountPercent = (message: string): number | null => {
  const clean = message.trim();
  if (!clean) return null;

  const candidatePatterns = [
    /(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:off|discount)?/i,
    /(?:discount|off|reduction)\s*(?:of)?\s*(\d+(?:\.\d+)?)\s*(?:%|percent)/i,
    /(?:give me|i want|i'm looking for|im looking for|looking for|can you do|can you give me|could you do|would you do)\s*(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:off|discount)?/i,
    /(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(?:percent|%)\s*(?:off|discount)?/i,
  ];

  for (const pattern of candidatePatterns) {
    const match = clean.match(pattern);
    if (!match) continue;

    const rawValue = match[1] ?? match[0];
    const normalized = typeof rawValue === "string" ? rawValue.toLowerCase() : "";
    const numeric = Number.parseFloat(rawValue);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) return numeric;

    const wordNumber = numberFromWord(normalized.replace(/%|percent|off|discount|\s+/g, "").trim());
    if (wordNumber !== null && wordNumber >= 0 && wordNumber <= 100) return wordNumber;
  }

  return null;
};

export const parseBuyerOffer = (message: string): number | null => {
  const clean = message.trim();

  // 1. Explicit keyword + price: e.g. "ok with 18000", "pay 18000", "offer 18000", "at 18000", "for 18000"
  const keywordMatch = clean.match(
    /(?:pay|offer|make it|do|how about|give me|at|for|around|hoping for|looking for|i'm around|i am around|thinking around|ok with|i'm ok with|im ok with|fine with|happy with|agree to|agree with|thinking of|thinking|price of|price|budget of|budget)\s*(?:₹|rs\.?)?\s*([\d,.]+(?:\s*(?:k|thousand))?)/i
  );
  if (keywordMatch) {
    const parsed = parseIndianPrice(keywordMatch[1]);
    if (parsed !== null && parsed > 0) return parsed;
  }

  // 2. Rupee symbol / Rs prefix + number: e.g. "₹18,000", "Rs 18000", "₹18k"
  const symbolMatch = clean.match(/(?:₹|rs\.?\s*)\s*([\d,.]+(?:\s*(?:k|thousand))?)/i);
  if (symbolMatch) {
    const parsed = parseIndianPrice(symbolMatch[1]);
    if (parsed !== null && parsed > 0) return parsed;
  }

  // 3. Standalone price with k/thousand: e.g. "18k with free delivery", "18 thousand"
  const kMatch = clean.match(/\b(\d+(?:\.\d+)?\s*(?:k|thousand))\b/i);
  if (kMatch) {
    const parsed = parseIndianPrice(kMatch[1]);
    if (parsed !== null && parsed > 0) return parsed;
  }

  // 4. Standalone 4+ digit number: e.g. "18000 + free delivery", "18000 can you do delivery"
  const standaloneMatch = clean.match(/\b(\d{4,7})\b/);
  if (standaloneMatch) {
    const isQty = new RegExp(`\\b${standaloneMatch[1]}\\s*(?:units?|pieces?|pcs|items?|chairs?|days?|hours?|mins?)\\b`, "i").test(clean);
    if (!isQty) {
      const parsed = Number.parseInt(standaloneMatch[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  return null;
};

const parseRequestedFreeDelivery = (message: string): boolean => {
  return /\b(?:free delivery|free shipping|delivery included|include delivery|waive delivery|waive shipping|cover delivery|cover shipping|no shipping fee|make shipping free|make delivery free|shipping included|include shipping|throw in free delivery|delivery be included)\b/i.test(message);
};

export const isFreeDeliveryRequest = (message: string): boolean => {
  const clean = message.trim().toLowerCase();
  // Question starters for read queries (e.g. "Does this include free delivery?", "Is shipping included?")
  if (/^(?:does|is|do i|how much is|what is|what's)\b/i.test(clean)) {
    return false;
  }
  // Questions checking existing terms explicitly: "does the offer include...", "is delivery included..."
  if (/(?:does.*include|is.*included|is.*free\?)/i.test(clean) && !/(?:can you|could you|can i|would you|if you)/i.test(clean)) {
    return false;
  }
  return /\b(?:can you|can i|could you|would you|will you|please|if you)?\s*(?:provide|include|make|waive|cover|throw in|get|add)\s*(?:free\s*)?(?:delivery|shipping)\b/i.test(clean) ||
    /\b(?:make delivery free|make shipping free|free delivery|free shipping|delivery included|waive shipping|waive delivery)\b/i.test(clean);
};

export const isExplicitAcceptance = (message: string): boolean => {
  const clean = message.trim().toLowerCase().replace(/[.!]+$/g, "");
  // Conditional statements ("If you include...", "If you do...") are NOT explicit acceptance
  if (/^(?:if\b|suppose|provided that|on condition that)/i.test(clean) || /\bif you\b/i.test(clean)) {
    return false;
  }
  // Proposals/questions are NOT explicit acceptance
  if (/(?:is this work|would this work|can you do|how about|thinking around|could you|what about|\?)/i.test(clean)) {
    return false;
  }

  // Strong unambiguous acceptance phrases
  if (
    /\b(?:i(?:'ll|ll| will)? accept|accept the offer|that works for me|deal|let's do it|lets do it|place the order|i'll take it|ill take it|take the offer|accept those terms|alright, i'll accept|i'll accept)\b/i.test(clean)
  ) {
    return true;
  }
  // Short positive confirmations ("yes", "okay", "alright")
  if (/^(?:yes|yeah|yup|ok|okay|sure|all right|alright)(?:\s+(?:i'll|ill|i will)?\s*(?:take|accept)(?:\s+it|\s+the offer|\s+those terms)?)?$/i.test(clean)) {
    return true;
  }
  return false;
};

export const sanitizeIntent = (parsed: any): BuyerIntent | null => {
  if (!parsed || typeof parsed !== "object") return null;
  if (!validIntentTypes.includes(parsed.type)) return null;

  const rawUpdates = parsed.updates && typeof parsed.updates === "object" && !Array.isArray(parsed.updates) ? parsed.updates : {};
  const updates: BuyerIntent["updates"] = {};

  for (const [key, value] of Object.entries(rawUpdates)) {
    if (!allowedUpdateKeys.has(key)) continue;

    if (key === "topic") {
      updates.topic = typeof value === "string" ? normalizeTopic(value) || null : null;
    } else if (key === "category") {
      updates.category = typeof value === "string" ? value.trim() || null : null;
    } else if (key === "minPrice" || key === "maxPrice") {
      const numeric = typeof value === "number" && Number.isFinite(value) ? value : parseIndianPrice(String(value ?? ""));
      if (numeric !== null) (updates as any)[key] = numeric;
    } else if (key === "quantity") {
      const numeric = typeof value === "number" && Number.isFinite(value) ? value : Number.parseInt(String(value ?? ""), 10);
      if (Number.isFinite(numeric) && numeric > 0) updates.quantity = numeric;
    } else if (key === "sortBy") {
      if (value === "relevance" || value === "price_asc" || value === "price_desc") updates.sortBy = value;
    } else if (key === "hardRequirements" || key === "requirements") {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        updates.hardRequirements = Object.fromEntries(
          Object.entries(value).filter(([, v]) => v !== undefined && v !== null)
        ) as Record<string, any>;
      }
    } else if (key === "softPreferences") {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        updates.softPreferences = Object.fromEntries(
          Object.entries(value).filter(([, v]) => v !== undefined && v !== null)
        ) as Record<string, any>;
      }
    } else if (key === "selectedProductIndex") {
      const idx = typeof value === "number" && Number.isFinite(value) ? value : parseInt(String(value ?? ""), 10);
      if (Number.isFinite(idx)) updates.selectedProductIndex = idx;
    } else if (key === "selectedProductReference") {
      if (typeof value === "string" && value.trim().length > 0) {
        updates.selectedProductReference = value.trim();
      }
    } else if (key === "selectedProductId") {
      if (typeof value === "string" && value.trim().length > 0) {
        updates.selectedProductId = value.trim();
      }
    } else if (key === "selectedProductName") {
      if (typeof value === "string" && value.trim().length > 0) {
        updates.selectedProductName = value.trim();
      }
    } else if (key === "buyerOffer") {
      const numeric = typeof value === "number" && Number.isFinite(value) ? value : parseIndianPrice(String(value ?? ""));
      if (numeric !== null && numeric > 0) updates.buyerOffer = numeric;
    } else if (key === "discountPercent") {
      const numeric = typeof value === "number" && Number.isFinite(value) ? value : Number.parseFloat(String(value ?? ""));
      if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) updates.discountPercent = numeric;
    } else if (key === "requestedFreeDelivery") {
      updates.requestedFreeDelivery = Boolean(value);
    } else if (key === "negotiationId") {
      if (typeof value === "string" && value.trim().length > 0) updates.negotiationId = value.trim();
    } else if (key === "negotiationStatus") {
      if (typeof value === "string" && value.trim().length > 0) updates.negotiationStatus = value.trim();
    } else if (key === "query") {
      const q = value as any;
      if (q && typeof q === "object") {
        updates.query = {
          kind: q.kind || "PRODUCT_PRICE",
          subject: q.subject,
          targetProductRef: q.targetProductRef,
        };
      }
    }
  }

  // Authoritative catalog validation pass
  if (updates.hardRequirements || updates.softPreferences) {
    const validated = validateCatalogRequirements(updates.hardRequirements || {}, updates.softPreferences || {});
    updates.hardRequirements = validated.hardRequirements;
    updates.softPreferences = validated.softPreferences;
    updates.requirements = validated.hardRequirements;
  }

  const result: BuyerIntent = { type: parsed.type, updates };
  if (Array.isArray(parsed.clearFields)) {
    const safeFields = parsed.clearFields.filter((field: any) => allowedClearFields.has(field));
    if (safeFields.length > 0) result.clearFields = safeFields as (keyof BuyerState)[];
  }
  if (typeof parsed.clarificationQuestion === "string") result.clarificationQuestion = parsed.clarificationQuestion;
  if (typeof parsed.outOfScopeMessage === "string") result.outOfScopeMessage = parsed.outOfScopeMessage;

  return result;
};

export const normalizeIntent = async (
  message: string,
  currentState: BuyerState,
  conversationHistory: ConversationTurn[],
  llmProvider?: LLMProvider
): Promise<BuyerIntent> => {
  if (llmProvider) {
    try {
      const intent = await llmProvider.generateIntent({
        message,
        currentState,
        conversationHistory,
      });
      if (intent) return intent;
    } catch (err: any) {
      console.warn("[INTENT_NORMALIZER] LLM Provider intent generation failed:", err.message || err);
    }
  }
  return localFallbackIntent(message, currentState);
};

export const localFallbackIntent = (
  message: string,
  currentState: BuyerState
): BuyerIntent => {
  const cleanMsg = message.trim();
  const lowerMsg = cleanMsg.toLowerCase();

  // Reset check
  if (/start over|reset/i.test(cleanMsg)) {
    return {
      type: "NEW_SEARCH",
      updates: {
        topic: null,
        category: null,
        minPrice: null,
        maxPrice: null,
        quantity: null,
        sortBy: "relevance",
        requirements: {},
        selectedProductId: null,
        selectedProductName: null,
        searchResults: [],
        negotiationId: null,
        negotiationStatus: null,
      },
      clearFields: [
        "topic",
        "category",
        "minPrice",
        "maxPrice",
        "quantity",
        "sortBy",
        "requirements",
        "selectedProductId",
        "selectedProductName",
        "searchResults",
        "negotiationId",
        "negotiationStatus",
      ],
    };
  }

  // ── PLACE_ORDER: natural language triggers (only when negotiation is ACCEPTED) ──
  const hasAcceptedNegotiation = Boolean(
    currentState.negotiationId && currentState.negotiationStatus === "ACCEPTED"
  );

  const isPlaceOrderPhrase =
    /(?:place\s+(?:the\s+)?order|go\s+ahead\s+(?:and\s+)?(?:order|buy|purchase)|let(?:'s|\s+us)\s+(?:place\s+(?:the\s+)?order|order|buy)|complete\s+(?:the\s+)?(?:order|purchase)|proceed\s+with\s+(?:the\s+)?(?:order|purchase)|confirm\s+(?:the\s+)?(?:order|purchase|deal)|i\s+(?:want|would\s+like)\s+to\s+(?:place\s+(?:the\s+)?order|buy\s+it|purchase\s+it|order\s+it)|finalize\s+(?:the\s+)?(?:order|deal)|checkout|check\s+out|proceed\s+to\s+(?:checkout|payment))/i.test(
      cleanMsg
    );

  if (hasAcceptedNegotiation && isPlaceOrderPhrase) {
    return {
      type: "PLACE_ORDER",
      updates: {},
      clearFields: [],
    };
  }

  // pendingAction PLACE_ORDER: "yes" / "ok" / "sure" alone triggers place order when pending
  const isAmbiguousYes = /^(?:yes|yeah|yep|ok|okay|sure|go ahead|proceed|confirm|absolutely|definitely|alright|fine|sounds good|let's do it|do it)\.?$/i.test(
    cleanMsg
  );
  if (hasAcceptedNegotiation && isAmbiguousYes && currentState.pendingAction === "PLACE_ORDER") {
    return {
      type: "PLACE_ORDER",
      updates: {},
      clearFields: [],
    };
  }

  // ── Explicit Acceptance Check ──
  const hasActiveNegotiation = Boolean(currentState.negotiationId && currentState.negotiationStatus === "ACTIVE");
  if (hasActiveNegotiation && isExplicitAcceptance(cleanMsg)) {
    return {
      type: "ACCEPT_NEGOTIATION",
      updates: {
        negotiationId: currentState.negotiationId,
        negotiationStatus: currentState.negotiationStatus,
      },
      clearFields: [],
    };
  }

  // ── Combined Selection + Negotiation Detection (runs BEFORE COMMERCE_QUERY) ──
  // e.g. "I liked the second option, may I negotiate?" / "Can you get option 2 for ₹18k?"
  // Must run before COMMERCE_QUERY to prevent "can we negotiate?" from being classified as PRODUCT_NEGOTIABILITY.
  {
    const isSelectionAndNegotiation =
      /(?:negotiate|negotiat|better price|better deal|discount|cheaper|lower price|open for negotiat|open to negotiat|can you get|can i get|get it for|get the .* for|i can pay|i'll pay|price of)/i.test(cleanMsg) &&
      /(?:first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last|option\s*\d+|number\s*\d+|#\d+|\d+(?:st|nd|rd|th)|option\s+(?:one|two|three|four|five|six|seven|eight|nine|ten))/i.test(cleanMsg);

    if (isSelectionAndNegotiation && !isExplicitAcceptance(cleanMsg)) {
      const ordIdx = parseOrdinalIndex(cleanMsg);
      const updates: BuyerIntent["updates"] = {};
      if (ordIdx !== null) {
        updates.selectedProductIndex = ordIdx;
      } else if (/last/i.test(cleanMsg)) {
        updates.selectedProductReference = "last";
      }

      // Also capture a buyer offer if the message includes a target price
      const extractedComboOffer = parseBuyerOffer(cleanMsg);
      if (extractedComboOffer && extractedComboOffer > 1000) {
        updates.buyerOffer = extractedComboOffer;
      }

      const parsedQtyCombo = parseQuantity(cleanMsg);
      if (parsedQtyCombo !== null) updates.quantity = parsedQtyCombo;
      if (parseRequestedFreeDelivery(cleanMsg)) updates.requestedFreeDelivery = true;

      return {
        type: "START_NEGOTIATION",
        updates,
        clearFields: [],
      };
    }
  }

  const combinedDiscountPercent = parseDiscountPercent(cleanMsg);
  const hasCommercialProposalPattern = combinedDiscountPercent !== null && (
    parseRequestedFreeDelivery(cleanMsg) ||
    /(?:with|and)\s*(?:free\s+)?(?:delivery|shipping)/i.test(cleanMsg) ||
    /(?:can you|could you|would you|give me|i\s+want|i'm looking for|im looking for|looking for|i'd like|i will buy|i'll buy|i can pay)\b/i.test(cleanMsg)
  );

  if (combinedDiscountPercent !== null && hasCommercialProposalPattern && !isExplicitAcceptance(cleanMsg)) {
    const updates: BuyerIntent["updates"] = {
      discountPercent: combinedDiscountPercent,
      requestedFreeDelivery: parseRequestedFreeDelivery(cleanMsg),
    };

    const parsedQty = parseQuantity(cleanMsg);
    if (parsedQty !== null) updates.quantity = parsedQty;

    const extractedOffer = parseBuyerOffer(cleanMsg);
    if (extractedOffer !== null && extractedOffer !== combinedDiscountPercent) updates.buyerOffer = extractedOffer;

    return {
      type: "BUYER_OFFER",
      updates,
      clearFields: [],
    };
  }

  // ── Free Delivery Request Check (Runs BEFORE Question Classification) ──
  if (isFreeDeliveryRequest(cleanMsg) && !isExplicitAcceptance(cleanMsg)) {
    const updates: BuyerIntent["updates"] = {
      requestedFreeDelivery: true,
    };

    const extractedBuyerOffer = parseBuyerOffer(cleanMsg);
    if (extractedBuyerOffer !== null) updates.buyerOffer = extractedBuyerOffer;

    const parsedQty = parseQuantity(cleanMsg);
    if (parsedQty !== null) updates.quantity = parsedQty;

    return {
      type: "REQUEST_FREE_DELIVERY",
      updates,
      clearFields: [],
    };
  }

  // ── Sorting Question Check (e.g. "Which one is cheapest?", "What's the cheapest?") ──
  const isQuestionAboutSorting = /^(?:which|what)\b/i.test(cleanMsg) && /(cheapest|lowest price|most expensive|highest price)/i.test(cleanMsg);
  if (isQuestionAboutSorting) {
    const sortBy = /(most expensive|highest price)/i.test(cleanMsg) ? "price_desc" : "price_asc";
    return {
      type: "UPDATE_SEARCH",
      updates: { sortBy },
      clearFields: [],
    };
  }

  // ── Commerce Question Classification ──
  const isQuestion =
    /\?$/.test(cleanMsg) ||
    /^(?:how much|what is|what's|how many|when|is shipping|is delivery|can i negotiate|is this negotiable|is my order|can i pay|why can't|why was|why do|why isn't|what discount|does this include|do you have|do you allow|what's your|what is your)\b/i.test(cleanMsg);

  const isNegotiationRequest =
    /^(?:can you give|can you do|can you offer|how about|i'll give|i'll pay|i can pay|reduce price|give me a better price|can we negotiate|can you negotiate|let's negotiate|can i negotiate)\b/i.test(cleanMsg) ||
    /(?:negotiate|better price|lower price|discount)/i.test(cleanMsg);

  if (isQuestion && !isNegotiationRequest && !isExplicitAcceptance(cleanMsg)) {
    let queryKind: CommerceQueryKind = "PRODUCT_PRICE";
    let targetRef: string | number | undefined;

    const ordMatch = cleanMsg.match(/(?:first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|\d+th)\b/i);
    if (ordMatch) {
      const idx = parseOrdinalIndex(ordMatch[0]);
      if (idx !== null) targetRef = idx;
    }

    if (/(?:price|cost|how much|listed price|cost of|what does this cost|price of)/i.test(cleanMsg)) {
      if (/(?:current offer|your offer|merchant offer)/i.test(cleanMsg)) {
        queryKind = "CURRENT_OFFER";
      } else if (/(?:total|total for|order total)/i.test(cleanMsg)) {
        queryKind = "ORDER_TOTAL";
      } else {
        queryKind = "PRODUCT_PRICE";
      }
    } else if (/(?:inventory|in stock|stock|available|left|how many|how many can i buy)/i.test(cleanMsg)) {
      if (/(?:max|maximum|limit|can i order|can i buy)/i.test(cleanMsg)) {
        queryKind = "ORDER_QUANTITY_LIMIT";
      } else {
        queryKind = "PRODUCT_INVENTORY";
      }
    } else if (/(?:free delivery|free shipping|shipping free|delivery free|include delivery|shipping included)/i.test(cleanMsg)) {
      queryKind = "SHIPPING_AVAILABILITY";
    } else if (/(?:delivery|arrive|shipping time|shipping take|expected delivery)/i.test(cleanMsg)) {
      queryKind = "PRODUCT_DELIVERY";
    } else if (/(?:negotiable|can i negotiate)/i.test(cleanMsg)) {
      queryKind = "PRODUCT_NEGOTIABILITY";
    } else if (/(?:current offer|offer right now)/i.test(cleanMsg)) {
      queryKind = "CURRENT_OFFER";
    } else if (/(?:negotiation status|happening with my offer|offer accepted)/i.test(cleanMsg)) {
      queryKind = "NEGOTIATION_STATUS";
    } else if (/(?:order status|order confirmed|agreement|order approved|is my order approved)/i.test(cleanMsg)) {
      queryKind = "AGREEMENT_STATUS";
    } else if (/(?:can i pay|ready for payment|pay now)/i.test(cleanMsg)) {
      queryKind = "PAYMENT_READINESS";
    } else if (/(?:total|final amount|how much will i pay)/i.test(cleanMsg)) {
      queryKind = "ORDER_TOTAL";
    } else if (/(?:why can't|why was|why rejected|why lower|why lower price)/i.test(cleanMsg)) {
      queryKind = "PRICE_EXPLANATION";
    } else if (/(?:discount|discounts|discount allowed|max discount)/i.test(cleanMsg)) {
      queryKind = "DISCOUNT_AVAILABILITY";
    } else if (/(?:warranty|guarantee|specifications|ram|storage|color)/i.test(cleanMsg)) {
      queryKind = "UNSUPPORTED_QUERY";
    }

    return {
      type: "COMMERCE_QUERY",
      updates: {
        query: {
          kind: queryKind,
          subject: currentState.selectedProductId ? "SELECTED_PRODUCT" : "CURRENT_SEARCH_RESULTS",
          targetProductRef: targetRef,
        },
      },
      clearFields: [],
    };
  }

  // ── Negotiation phrase & offer detection ──
  const isNegotiationPhrase =
    /(better price|discount|cheaper price|cheaper deal|lower price|better deal|negotiate|best price|reduce the price|reduce price|discounted|come down|do better|too high|how about|i can pay|i'll pay|i will pay|can you do|what price|hoping for|looking for|around|is this work|is this okay|would this work|free delivery|free shipping)/i.test(cleanMsg) ||
    /^(?:can you|is there|any|what is|i'd like to)\s+(?:a\s+)?(?:better\s+price|discount|cheaper|negotiate|lower|deal|best\s+price)/i.test(cleanMsg);

  const extractedBuyerOffer = parseBuyerOffer(cleanMsg);

  const parsedQty = parseQuantity(cleanMsg);
  const isFreeDel = parseRequestedFreeDelivery(cleanMsg);

  if (isNegotiationPhrase || (hasActiveNegotiation && (extractedBuyerOffer !== null || isFreeDel || /better|lower|high|down/i.test(cleanMsg)))) {
    const intentType: IntentType = extractedBuyerOffer !== null ? "BUYER_OFFER" : (hasActiveNegotiation ? "CONTINUE_NEGOTIATION" : "START_NEGOTIATION");
    const updates: BuyerIntent["updates"] = {};
    if (extractedBuyerOffer !== null) updates.buyerOffer = extractedBuyerOffer;
    if (parsedQty !== null) updates.quantity = parsedQty;
    if (isFreeDel) updates.requestedFreeDelivery = true;
    return {
      type: intentType,
      updates,
      clearFields: [],
    };
  }

  // Clear selection check: "Actually, show me another one", "different product", "clear selection", "unselect"
  if (
    /(show me another|another one|different product|clear selection|unselect|choose another|select another)/i.test(
      cleanMsg
    )
  ) {
    return {
      type: "UPDATE_SEARCH",
      updates: {
        selectedProductId: null,
        selectedProductName: null,
      },
      clearFields: ["selectedProductId", "selectedProductName"],
    };
  }

  // Product details intent check: "tell me more", "give me details", "how much is it", "how many are available", "specifications", "what are the details"
  if (
    /(tell me more|give me details|details about|product details|how much is it|how many are available|what are the details|specifications of)/i.test(
      lowerMsg
    )
  ) {
    return {
      type: "PRODUCT_DETAILS",
      updates: {},
      clearFields: [],
    };
  }

  // Product Selection check
  const hasExistingSearchResults =
    currentState.searchResults.length > 0 ||
    currentState.lastProducts.length > 0 ||
    Boolean(currentState.topic);

  const isSelectionPhrase =
    !isQuestionAboutSorting && (
      /(?:i\s+want|i'll\s+take|select|choose|prefer|go\s+with|give\s+me)?\s*(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|\d+th|last|cheapest|most\s+expensive|option\s*\d+|number\s*\d+|#\d+)(?:\s+one|\s+option)?\b/i.test(
        cleanMsg
      ) ||
      /^(?:option|number|#)\s*\d+$/i.test(cleanMsg) ||
      /^(first|second|third|fourth|fifth|\d+th|last|cheapest|most expensive)$/i.test(cleanMsg) ||
      /^(?:i\s+want\s+)?(?:the\s+one\s+at|at)\s*(?:₹|rs)?\s*[\d,]+/i.test(cleanMsg) ||
      (hasExistingSearchResults && /^(?:i\s+want\s+)?(?:that|this)\s+one$/i.test(cleanMsg))
    );

  const isNameReference =
    hasExistingSearchResults &&
    !isSelectionPhrase &&
    !isQuestionAboutSorting &&
    !/^(?:show\s+me|find\s+me|look\s+for|search\s+for|i\s+want\s+to\s+buy|i\s+want\s+an?|i\s+want|i\s+need|buy|under|above|between|make it|i'd\s+prefer|i\s+prefer|preferably|ideally|must\s+have|must\s+be|actually)\b/i.test(cleanMsg) &&
    !/(?:under|above|below|between|less than|more than)\b/i.test(cleanMsg) &&
    !/(?:preferably|ideally|must have|must be|required|preferred|comfortable|comfort|ergonomic|adjustable|lumbar|ram|storage|ssd|hdd|size|color|colour)\b/i.test(cleanMsg) &&
    !/^(?:office chair|office chairs|laptops?|desks?|monitors?)$/i.test(lowerMsg) &&
    !/^(?:i\s+need|i\s+want)\s+\d+$/i.test(cleanMsg);

  if (isSelectionPhrase || isNameReference) {
    const ordIdx = parseOrdinalIndex(cleanMsg);
    if (ordIdx !== null) {
      return {
        type: "SELECT_PRODUCT",
        updates: {
          selectedProductIndex: ordIdx,
          selectedProductReference: cleanMsg,
        },
        clearFields: [],
      };
    }

    if (/(cheapest|lowest price)/i.test(cleanMsg)) {
      return {
        type: "SELECT_PRODUCT",
        updates: {
          selectedProductReference: "cheapest",
        },
        clearFields: [],
      };
    }

    if (/(most expensive|highest price)/i.test(cleanMsg)) {
      return {
        type: "SELECT_PRODUCT",
        updates: {
          selectedProductReference: "most expensive",
        },
        clearFields: [],
      };
    }

    if (/last/i.test(cleanMsg)) {
      return {
        type: "SELECT_PRODUCT",
        updates: {
          selectedProductReference: "last",
        },
        clearFields: [],
      };
    }

    return {
      type: "SELECT_PRODUCT",
      updates: {
        selectedProductReference: cleanMsg,
      },
      clearFields: [],
    };
  }

  const clearFields: (keyof BuyerState)[] = [];
  if (/(forget the budget|remove budget|no budget|remove price filter|no price filter|clear price)/i.test(cleanMsg)) {
    clearFields.push("maxPrice", "minPrice");
  }
  if (/(remove quantity|clear quantity|forget quantity)/i.test(cleanMsg)) {
    clearFields.push("quantity");
  }

  const updates: BuyerIntent["updates"] = {};
  const parsedPrice = parsePriceConstraint(cleanMsg);
  if (parsedPrice.maxPrice !== null) updates.maxPrice = parsedPrice.maxPrice;
  if (parsedPrice.minPrice !== null) updates.minPrice = parsedPrice.minPrice;

  if (/(cheapest|lowest price)/i.test(cleanMsg)) {
    updates.sortBy = "price_asc";
  } else if (/(most expensive|highest price)/i.test(cleanMsg)) {
    updates.sortBy = "price_desc";
  }

  const parsedQuantity = parseQuantity(cleanMsg);
  if (parsedQuantity !== null) updates.quantity = parsedQuantity;

  const rawHard: Record<string, string | number | boolean> = {};
  const rawSoft: Record<string, string | number | boolean> = {};

  // Ergonomic
  if (/ergonomic/i.test(cleanMsg) && !/not ergonomic/i.test(cleanMsg)) {
    if (/(?:prefer|preferably|ideally|i'd like|i'd prefer|would be nice)\s+ergonomic/i.test(cleanMsg)) {
      rawSoft.ergonomic = true;
    } else {
      rawHard.ergonomic = true;
    }
  }

  // Adjustable height
  if (/(?:adjustable[- ]?height|height[- ]?adjustable)/i.test(cleanMsg)) {
    if (/(?:prefer|preferably|ideally|i'd like|i'd prefer|would be nice)\s+(?:adjustable[- ]?height|height[- ]?adjustable)/i.test(cleanMsg)) {
      rawSoft.adjustableHeight = true;
    } else {
      rawHard.adjustableHeight = true;
    }
  }

  // Lumbar support
  if (/lumbar support/i.test(cleanMsg)) {
    if (/(?:prefer|preferably|ideally|i'd like|i'd prefer|would be nice)\s+lumbar support/i.test(cleanMsg)) {
      rawSoft.lumbarSupport = true;
    } else {
      rawHard.lumbarSupport = true;
    }
  }

  // Comfort / Comfortable
  if (/comfortable|comfort/i.test(cleanMsg)) {
    rawSoft.comfortable = true;
  }

  // Use case / duration
  if (/(?:home workspace|working from home|work from home|home office|home use|home working)/i.test(cleanMsg)) {
    rawSoft.useCase = "working from home";
  } else if (/(?:long working hours|long hours)/i.test(cleanMsg)) {
    rawSoft.useCase = "long working hours";
  } else if (/(?:coding)/i.test(cleanMsg)) {
    rawSoft.useCase = "coding";
  }

  if (/(?:all day)/i.test(cleanMsg)) {
    rawSoft.useDuration = "all day";
  }

  // RAM
  const ramMatch = cleanMsg.match(/(\d+GB)\s*RAM/i);
  if (ramMatch) {
    if (/(?:prefer|preferably|ideally|i'd like|i'd prefer|would be nice|if possible)\s*\d+GB\s*RAM/i.test(cleanMsg) || /\d+GB\s*RAM\s+(?:preferably|if possible|preferred)/i.test(cleanMsg)) {
      rawSoft.ram = ramMatch[1].toUpperCase();
    } else {
      rawHard.ram = ramMatch[1].toUpperCase();
    }
  }

  // Storage
  const storageMatch = cleanMsg.match(/(\d+(?:GB|TB))\s*(?:SSD|storage|HDD)/i);
  if (storageMatch) {
    if (/(?:prefer|preferably|ideally|i'd like|i'd prefer|would be nice|if possible)\s*\d+(?:GB|TB)/i.test(cleanMsg) || /\d+(?:GB|TB)\s*(?:SSD|storage|HDD)?\s+(?:preferably|if possible|preferred)/i.test(cleanMsg)) {
      rawSoft.storage = storageMatch[1].toUpperCase();
    } else {
      rawHard.storage = storageMatch[1].toUpperCase();
    }
  }

  // Size (e.g. shoes)
  const sizeMatch = cleanMsg.match(/\bsize\s*(\d+(?:\.\d+)?)\b/i);
  if (sizeMatch) {
    if (/(?:prefer|preferably|ideally|i'd like|i'd prefer|would be nice|if possible)\s*size/i.test(cleanMsg) || /size\s*\d+\s*(?:preferably|if possible|preferred)/i.test(cleanMsg)) {
      rawSoft.size = sizeMatch[1];
    } else {
      rawHard.size = sizeMatch[1];
    }
  }

  // Color
  const colorMatch = cleanMsg.match(/\b(black|white|red|blue|grey|gray|green|silver)\b/i);
  if (colorMatch && !/in general|any color/i.test(cleanMsg)) {
    const col = colorMatch[1].toLowerCase();
    if (/(is required|must be|required)/i.test(cleanMsg) || new RegExp(`${col}\\s+is\\s+required`, "i").test(cleanMsg)) {
      rawHard.color = col;
    } else if (new RegExp(`(?:prefer|preferably|ideally|i'd like|i'd prefer|would be nice|if possible|preferred)\\s+${col}`, "i").test(cleanMsg) || new RegExp(`${col}\\s+(?:if possible|preferred|preferably)`, "i").test(cleanMsg)) {
      rawSoft.color = col;
    } else {
      rawHard.color = col;
    }
  }

  // Lightweight / Camera
  if (/lightweight/i.test(cleanMsg)) {
    rawSoft.lightweight = true;
  }
  if (/good camera|camera quality|nice camera/i.test(cleanMsg)) {
    rawSoft.cameraQuality = true;
  }

  // Handle explicit upgrades / downgrades / negations
  if (/(black is required|must be black)/i.test(cleanMsg)) {
    rawHard.color = "black";
    delete rawSoft.color;
  } else if (/(black is preferred|black if possible)/i.test(cleanMsg)) {
    rawSoft.color = "black";
    delete rawHard.color;
  }

  if (/(don't care about color|no preference for color)/i.test(cleanMsg)) {
    delete rawHard.color;
    delete rawSoft.color;
    clearFields.push("softPreferences");
  }

  // Authoritative catalog validation pass
  const validated = validateCatalogRequirements(rawHard, rawSoft);
  if (Object.keys(validated.hardRequirements).length > 0) {
    updates.hardRequirements = validated.hardRequirements;
    updates.requirements = validated.hardRequirements;
  }
  if (Object.keys(validated.softPreferences).length > 0) {
    updates.softPreferences = validated.softPreferences;
  }

  const topicCandidate = extractTopicText(cleanMsg);
  const normalizedTopic = topicCandidate ? normalizeTopic(topicCandidate) : "";

  if (clearFields.length > 0) {
    return { type: "UPDATE_SEARCH", updates, clearFields };
  }

  if (normalizedTopic && normalizedTopic.length > 0 && (
    !currentState.topic ||
    currentState.topic !== normalizedTopic ||
    /^(?:show\s+me|find\s+me|look\s+for|search\s+for|i\s+want\s+to\s+buy|i\s+want|i\s+need|buy|purchase)\b/i.test(cleanMsg)
  )) {
    return {
      type: "NEW_SEARCH",
      updates: { topic: normalizedTopic, ...updates },
      clearFields: [],
    };
  }

  return {
    type: "UPDATE_SEARCH",
    updates,
    clearFields: [],
  };
};
