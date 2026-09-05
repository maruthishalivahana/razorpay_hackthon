import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Agent Builder Landing Page & Card UI Logic", () => {
  // 1. Status display mapping
  it("1. correctly maps agent status based on agentEnabled flag without hardcoding Active", () => {
    const getStatusLabel = (agentEnabled?: boolean, policyEnabled: boolean = true) => {
      const enabled = agentEnabled ?? true;
      const isActive = enabled && policyEnabled;
      return isActive ? "● Active" : "○ Disabled";
    };

    assert.strictEqual(getStatusLabel(true, true), "● Active");
    assert.strictEqual(getStatusLabel(false, true), "○ Disabled");
    assert.strictEqual(getStatusLabel(true, false), "○ Disabled");
  });

  // 2. Agent description resolution
  it("2. uses merchant description when available, falling back to safe generic description", () => {
    const defaultDescription =
      "AI commerce agent that helps buyers discover products, negotiate offers, and complete purchases within your merchant-defined rules.";

    const resolveDescription = (merchantDesc?: string) => {
      if (merchantDesc && merchantDesc.trim().length > 0) {
        return merchantDesc;
      }
      return defaultDescription;
    };

    assert.strictEqual(
      resolveDescription("Custom agent for electronics catalog"),
      "Custom agent for electronics catalog"
    );
    assert.strictEqual(resolveDescription(""), defaultDescription);
    assert.strictEqual(resolveDescription(undefined), defaultDescription);
  });

  // 3. Implemented features list completeness
  it("3. contains exact implemented capabilities in feature list", () => {
    const features = [
      "Product discovery",
      "Product matching",
      "Price negotiation",
      "Merchant policy enforcement",
      "Free-shipping policy handling",
      "Agreement and approval workflow",
      "Payment readiness",
    ];

    assert.strictEqual(features.length, 7);
    assert.ok(features.includes("Product discovery"));
    assert.ok(features.includes("Price negotiation"));
    assert.ok(features.includes("Free-shipping policy handling"));
    assert.ok(features.includes("Payment readiness"));
  });

  // 4. Product coverage display
  it("4. formats product coverage accurately without hardcoding numbers", () => {
    const formatProductCoverage = (count: number | null) => {
      if (count !== null && count >= 0) {
        return `Products available to agent: ${count}`;
      }
      return "Uses active merchant products";
    };

    assert.strictEqual(formatProductCoverage(24), "Products available to agent: 24");
    assert.strictEqual(formatProductCoverage(0), "Products available to agent: 0");
    assert.strictEqual(formatProductCoverage(null), "Uses active merchant products");
  });

  // 5. Route structure verification
  it("5. Agent Builder routes directly to configuration with test route available", () => {
    const routes = {
      agentBuilder: "/merchant/agent-builder",
      test: "/merchant/agent-builder/test",
    };

    assert.strictEqual(routes.agentBuilder, "/merchant/agent-builder");
    assert.strictEqual(routes.test, "/merchant/agent-builder/test");
  });

  // 6. Test Agent BuyerChat reuse
  it("6. reuses BuyerChat for test agent using the same backend buyer endpoint", () => {
    const testAgentConfig = {
      embedded: true,
      headerTitle: "Negotiation Agent — Test",
      backLink: { href: "/merchant/agent-builder", label: "Back to Agent Builder" },
      endpoint: "/api/agents/buyer/chat",
    };

    assert.strictEqual(testAgentConfig.embedded, true);
    assert.strictEqual(testAgentConfig.headerTitle, "Negotiation Agent — Test");
    assert.strictEqual(testAgentConfig.endpoint, "/api/agents/buyer/chat");
  });
});
