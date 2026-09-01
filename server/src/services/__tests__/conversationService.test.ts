import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import Conversation from "../../models/Conversation.js";
import {
  createConversation,
  getConversation,
  updateConversationState,
  addMessage,
  addSearchResults,
  updateExpiration,
  expireConversation,
  completeConversation,
  clearConversationState,
  generateConversationId,
  storedStateToBuyerState,
} from "../conversationService.js";
import { createEmptyState } from "../../agents/buyerState.js";

describe("Conversation Persistence Service Tests", () => {
  before(async () => {
    await connectDB();
  });

  after(async () => {
    await Conversation.deleteMany({ conversationId: /^test_conv_/ });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Conversation.deleteMany({ conversationId: /^test_conv_/ });
  });

  test("1. Create conversation with default active status and generated ID", async () => {
    const customId = `test_conv_${Date.now()}_1`;
    const conv = await createConversation({}, customId);

    assert.equal(conv.conversationId, customId);
    assert.equal(conv.status, "active");
    assert.ok(conv.expiresAt > new Date());
    assert.deepEqual(conv.messages, []);
  });

  test("2. Generate conversationId utility format", () => {
    const id = generateConversationId();
    assert.ok(id.startsWith("conv_"));
    assert.ok(id.length > 10);
  });

  test("3. Retrieve existing conversation by conversationId", async () => {
    const customId = `test_conv_${Date.now()}_3`;
    await createConversation({ topic: "laptop" }, customId);

    const retrieved = await getConversation(customId);
    assert.ok(retrieved);
    assert.equal(retrieved?.conversationId, customId);
    assert.equal(retrieved?.buyerState.topic, "laptop");
  });

  test("4. Update BuyerState in database", async () => {
    const customId = `test_conv_${Date.now()}_4`;
    await createConversation({}, customId);

    const updatedState = {
      ...createEmptyState(),
      topic: "office chair",
      maxPrice: 8000,
      turnCount: 2,
    };

    const updated = await updateConversationState(customId, updatedState);
    assert.ok(updated);
    assert.equal(updated?.buyerState.topic, "office chair");
    assert.equal(updated?.buyerState.maxPrice, 8000);
    assert.equal(updated?.buyerState.turnCount, 2);
  });

  test("5. Add user message to conversation", async () => {
    const customId = `test_conv_${Date.now()}_5`;
    await createConversation({}, customId);

    const updated = await addMessage(customId, "user", "I want an office chair");
    assert.ok(updated);
    assert.equal(updated?.messages.length, 1);
    assert.equal(updated?.messages[0].role, "user");
    assert.equal(updated?.messages[0].content, "I want an office chair");
  });

  test("6. Add assistant message to conversation", async () => {
    const customId = `test_conv_${Date.now()}_6`;
    await createConversation({}, customId);

    const updated = await addMessage(customId, "assistant", "Here are the top chairs");
    assert.ok(updated);
    assert.equal(updated?.messages.length, 1);
    assert.equal(updated?.messages[0].role, "assistant");
  });

  test("7. Preserve message history chronologically", async () => {
    const customId = `test_conv_${Date.now()}_7`;
    await createConversation({}, customId);

    await addMessage(customId, "user", "Looking for laptops");
    await addMessage(customId, "assistant", "Found 3 laptops");
    await addMessage(customId, "user", "Under 50000");

    const fetched = await getConversation(customId);
    assert.equal(fetched?.messages.length, 3);
    assert.equal(fetched?.messages[0].content, "Looking for laptops");
    assert.equal(fetched?.messages[1].content, "Found 3 laptops");
    assert.equal(fetched?.messages[2].content, "Under 50000");
  });

  test("8. Add search result product IDs", async () => {
    const customId = `test_conv_${Date.now()}_8`;
    await createConversation({}, customId);

    const fakeId1 = new mongoose.Types.ObjectId();
    const fakeId2 = new mongoose.Types.ObjectId();

    const updated = await addSearchResults(customId, [fakeId1, fakeId2.toString()]);
    assert.equal(updated?.searchResultProductIds.length, 2);
    assert.equal(updated?.searchResultProductIds[0].toString(), fakeId1.toString());
    assert.equal(updated?.searchResultProductIds[1].toString(), fakeId2.toString());
  });

  test("9. Refresh expiration sliding window", async () => {
    const customId = `test_conv_${Date.now()}_9`;
    const conv = await createConversation({}, customId);
    const initialExpiresAt = conv.expiresAt;

    // Small delay to ensure timestamp change
    await new Promise((r) => setTimeout(r, 50));
    const refreshed = await updateExpiration(customId);

    assert.ok(refreshed);
    assert.ok(refreshed.expiresAt.getTime() >= initialExpiresAt.getTime());
  });

  test("10. Detect expiration when reading past expiresAt", async () => {
    const customId = `test_conv_${Date.now()}_10`;
    const conv = await createConversation({}, customId);

    // Manually set expiresAt in past
    conv.expiresAt = new Date(Date.now() - 1000);
    await conv.save();

    const fetched = await getConversation(customId);
    assert.ok(fetched);
    assert.equal(fetched?.status, "expired");
  });

  test("11. Explicitly mark conversation expired", async () => {
    const customId = `test_conv_${Date.now()}_11`;
    await createConversation({}, customId);

    const expired = await expireConversation(customId);
    assert.equal(expired?.status, "expired");
  });

  test("12. Mark conversation completed", async () => {
    const customId = `test_conv_${Date.now()}_12`;
    await createConversation({}, customId);

    const completed = await completeConversation(customId);
    assert.equal(completed?.status, "completed");
  });

  test("13. Missing conversation returns null", async () => {
    const result = await getConversation("non_existent_conv_id_9999");
    assert.equal(result, null);
  });

  test("14. State survives serialization cleanly", async () => {
    const customId = `test_conv_${Date.now()}_14`;
    await createConversation({}, customId);

    const state = {
      ...createEmptyState(),
      topic: "desk",
      minPrice: 1000,
      maxPrice: 5000,
      quantity: 2,
      sortBy: "price_asc" as const,
      turnCount: 5,
    };

    await updateConversationState(customId, state);
    const retrievedDoc = await getConversation(customId);
    const hydratedState = storedStateToBuyerState(retrievedDoc?.buyerState);

    assert.equal(hydratedState.topic, "desk");
    assert.equal(hydratedState.minPrice, 1000);
    assert.equal(hydratedState.maxPrice, 5000);
    assert.equal(hydratedState.quantity, 2);
    assert.equal(hydratedState.sortBy, "price_asc");
    assert.equal(hydratedState.turnCount, 5);
  });

  test("15. Requirements map persists accurately", async () => {
    const customId = `test_conv_${Date.now()}_15`;
    await createConversation({}, customId);

    const state = {
      ...createEmptyState(),
      topic: "laptop",
      requirements: { ram: "16GB", storage: "512GB SSD" },
    };

    await updateConversationState(customId, state);
    const retrievedDoc = await getConversation(customId);
    const hydratedState = storedStateToBuyerState(retrievedDoc?.buyerState);

    assert.equal(hydratedState.requirements.ram, "16GB");
    assert.equal(hydratedState.requirements.storage, "512GB SSD");
  });

  test("16. selectedProductId persists in buyerState schema", async () => {
    const customId = `test_conv_${Date.now()}_16`;
    const prodId = new mongoose.Types.ObjectId();
    const conv = await createConversation({}, customId);

    conv.buyerState.selectedProductId = prodId;
    conv.buyerState.selectedProductName = "Ergonomic Mesh Chair";
    await conv.save();

    const fetched = await getConversation(customId);
    assert.equal(fetched?.buyerState.selectedProductId?.toString(), prodId.toString());
    assert.equal(fetched?.buyerState.selectedProductName, "Ergonomic Mesh Chair");
  });

  test("17. Multiple conversations remain isolated", async () => {
    const idA = `test_conv_${Date.now()}_17A`;
    const idB = `test_conv_${Date.now()}_17B`;

    await createConversation({}, idA);
    await createConversation({}, idB);

    await updateConversationState(idA, { ...createEmptyState(), topic: "office chair", maxPrice: 8000 });
    await updateConversationState(idB, { ...createEmptyState(), topic: "laptop", maxPrice: 60000 });

    const docA = await getConversation(idA);
    const docB = await getConversation(idB);

    assert.equal(docA?.buyerState.topic, "office chair");
    assert.equal(docA?.buyerState.maxPrice, 8000);

    assert.equal(docB?.buyerState.topic, "laptop");
    assert.equal(docB?.buyerState.maxPrice, 60000);
  });

  test("18. Start-over clears state without deleting message history", async () => {
    const customId = `test_conv_${Date.now()}_18`;
    await createConversation({}, customId);

    await addMessage(customId, "user", "I want an office chair");
    await updateConversationState(customId, { ...createEmptyState(), topic: "office chair", maxPrice: 8000 });

    await clearConversationState(customId);

    const fetched = await getConversation(customId);
    assert.equal(fetched?.buyerState.topic, null);
    assert.equal(fetched?.buyerState.maxPrice, null);
    assert.equal(fetched?.messages.length, 1); // Message history preserved!
  });
});
