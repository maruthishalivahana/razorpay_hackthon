import type { BuyerState, BuyerIntent } from "../agents/buyerState.js";
import type { ConversationTurn } from "../agents/buyerAgent.js";
import type { PublicProduct } from "../services/productService.js";

export interface LLMGenerateIntentInput {
  message: string;
  currentState: BuyerState;
  conversationHistory: ConversationTurn[];
}

export interface LLMGenerateResponseInput {
  message: string;
  products: PublicProduct[];
  buyerState: BuyerState;
  conversationHistory: ConversationTurn[];
  commercialResult?: any;
}

export interface LLMProvider {
  readonly name: string;

  generateIntent(input: LLMGenerateIntentInput): Promise<BuyerIntent>;

  generateResponse(input: LLMGenerateResponseInput): Promise<string>;
}
