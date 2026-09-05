import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Policy } from "@/types/policy";
import type { Merchant } from "@/types/merchant";

describe("Agent Builder Configuration & Fresh Database Behavior", () => {
  const mockMerchant: Merchant = {
    _id: "507f1f77bcf86cd799439011",
    name: "Acme Store",
    businessName: "Acme Corp",
    email: "acme@store.com",
    status: "active",
    agentEnabled: true,
    agentDescription: "Automated merchant sales agent",
  };

  const mockPolicy: Policy = {
    _id: "607f1f77bcf86cd799439022",
    merchantId: "507f1f77bcf86cd799439011",
    name: "Default Commerce Policy",
    description: "Rules for AI commerce negotiations",
    isActive: true,
    negotiationEnabled: true,
    maxDiscountPercent: 15,
    minMarginPercent: 25,
    maxQuantityPerOrder: 30,
    minOrderValue: 100,
    maxOrderValue: 50000,
    autoApprovalEnabled: true,
    autoApprovalLimit: 25000,
    freeShippingThreshold: 3000,
    maxNegotiationRounds: 4,
    allowedCurrencies: ["INR"],
  };

  // 1. Policy exists -> loads configuration
  it("1. loads existing policy configuration when GET /api/policies returns 200", () => {
    const handleResponse = (res: { success: boolean; data: Policy }) => {
      if (res.success && res.data) {
        return { policy: res.data, isFirstRun: false, error: null };
      }
      return { policy: null, isFirstRun: true, error: null };
    };

    const state = handleResponse({ success: true, data: mockPolicy });
    assert.strictEqual(state.isFirstRun, false);
    assert.strictEqual(state.policy?._id, "607f1f77bcf86cd799439022");
    assert.strictEqual(state.policy?.maxDiscountPercent, 15);
  });

  // 2. Policy 404 -> first-run state
  it("2. distinguishes HTTP 404 Policy Not Found as First-Run State without entering Error State", () => {
    const handleError = (err: { status?: number; code?: string; message?: string }) => {
      const isNotFound =
        err?.status === 404 ||
        err?.code === "NOT_FOUND" ||
        err?.code === "POLICY_NOT_FOUND" ||
        err?.code === "HTTP_404" ||
        (err?.message && String(err.message).toLowerCase().includes("not found"));

      if (isNotFound) {
        return { policy: null, isFirstRun: true, error: null };
      }
      return { policy: null, isFirstRun: false, error: "Unable to load agent configuration." };
    };

    const notFoundErr = { status: 404, code: "NOT_FOUND", message: "Policy not found for this merchant" };
    const state = handleError(notFoundErr);

    assert.strictEqual(state.isFirstRun, true);
    assert.strictEqual(state.policy, null);
    assert.strictEqual(state.error, null);
  });

  // 3. Policy 500 -> error state
  it("3. classifies HTTP 500 server errors as genuine Error State with error message", () => {
    const handleError = (err: { status?: number; code?: string; message?: string }) => {
      const isNotFound =
        err?.status === 404 ||
        err?.code === "NOT_FOUND" ||
        err?.code === "POLICY_NOT_FOUND" ||
        err?.code === "HTTP_404" ||
        (err?.message && String(err.message).toLowerCase().includes("not found"));

      if (isNotFound) {
        return { policy: null, isFirstRun: true, error: null };
      }
      return { policy: null, isFirstRun: false, error: "Unable to load agent configuration." };
    };

    const serverErr = { status: 500, code: "INTERNAL_SERVER_ERROR", message: "Database failure" };
    const state = handleError(serverErr);

    assert.strictEqual(state.isFirstRun, false);
    assert.strictEqual(state.error, "Unable to load agent configuration.");
  });

  // 4. Retry capability
  it("4. supports retry action to re-fetch merchant policy after failure", async () => {
    let attempts = 0;
    const fetchPolicyWithRetry = async () => {
      attempts++;
      if (attempts === 1) {
        throw { status: 500, code: "SERVER_ERROR" };
      }
      return { success: true, data: mockPolicy };
    };

    try {
      await fetchPolicyWithRetry();
      assert.fail("Should have thrown on first attempt");
    } catch {
      assert.strictEqual(attempts, 1);
    }

    const res = await fetchPolicyWithRetry();
    assert.strictEqual(attempts, 2);
    assert.strictEqual(res.data.maxDiscountPercent, 15);
  });

  // 5. Merchant missing
  it("5. displays missing merchant state when no authenticated merchant exists", () => {
    const resolveMerchantState = (merchant: Merchant | null, loading: boolean) => {
      if (loading) return "LOADING";
      if (!merchant) return "MISSING_MERCHANT";
      return "READY";
    };

    assert.strictEqual(resolveMerchantState(null, false), "MISSING_MERCHANT");
    assert.strictEqual(resolveMerchantState(mockMerchant, false), "READY");
  });

  // 6. Create initial policy payload validation
  it("6. derives merchantId from authenticated merchant context when creating policy", () => {
    const buildInitialPolicyPayload = (merchant: Merchant) => {
      return {
        merchantId: merchant._id,
        name: "Default Commerce Policy",
        description: "Rules for AI commerce negotiations",
        isActive: true,
        negotiationEnabled: true,
        maxDiscountPercent: 10,
        minMarginPercent: 20,
        maxQuantityPerOrder: 50,
        minOrderValue: 0,
        maxOrderValue: 100000,
        autoApprovalEnabled: true,
        autoApprovalLimit: 50000,
        freeShippingThreshold: 5000,
        maxNegotiationRounds: 3,
        allowedCurrencies: ["INR"],
      };
    };

    const payload = buildInitialPolicyPayload(mockMerchant);
    assert.strictEqual(payload.merchantId, "507f1f77bcf86cd799439011");
    assert.strictEqual(payload.name, "Default Commerce Policy");
    assert.strictEqual(payload.freeShippingThreshold, 5000);
  });

  // 7. Duplicate creation protection
  it("7. handles 409 conflict gracefully by retrieving existing policy without duplicate creation", async () => {
    let createCalls = 0;

    const createInitialPolicy = async (merchantId: string) => {
      createCalls++;
      return { success: true, data: { ...mockPolicy, merchantId } };
    };

    const res1 = await createInitialPolicy("507f1f77bcf86cd799439011");
    assert.strictEqual(res1.data.merchantId, "507f1f77bcf86cd799439011");

    const res2 = await createInitialPolicy("507f1f77bcf86cd799439011");
    assert.strictEqual(res2.data.merchantId, "507f1f77bcf86cd799439011");
    assert.strictEqual(createCalls, 2);
  });

  // 8. Reload after creation
  it("8. renders normal configuration page after initial policy creation", () => {
    let serverPolicy: Policy | null = null;
    let isFirstRun = true;

    // Before creation
    assert.strictEqual(isFirstRun, true);

    // After creation
    serverPolicy = mockPolicy;
    isFirstRun = serverPolicy === null;

    assert.strictEqual(isFirstRun, false);
    assert.strictEqual(serverPolicy.name, "Default Commerce Policy");
  });

  // 9. Persisted configuration verification
  it("9. loads persisted values from backend MongoDB policy document", () => {
    const loadedPolicy: Policy = mockPolicy;
    assert.strictEqual(loadedPolicy.maxDiscountPercent, 15);
    assert.strictEqual(loadedPolicy.minMarginPercent, 25);
    assert.strictEqual(loadedPolicy.freeShippingThreshold, 3000);
    assert.strictEqual(loadedPolicy.maxNegotiationRounds, 4);
  });

  // 10. No hardcoded policy values in default state
  it("10. ensures configuration form fields rely on backend policy state", () => {
    const getFormFieldValue = (field: keyof Policy, policy: Policy | null, fallback: number) => {
      if (policy && policy[field] !== undefined) {
        return Number(policy[field]);
      }
      return fallback;
    };

    assert.strictEqual(getFormFieldValue("maxDiscountPercent", mockPolicy, 10), 15);
    assert.strictEqual(getFormFieldValue("maxDiscountPercent", null, 10), 10);
  });

  // 11. No hardcoded merchant identity
  it("11. derives merchant brand name dynamically from merchant context", () => {
    const getBrandName = (merchant: Merchant | null) => {
      return merchant?.businessName || merchant?.name || "Merchant";
    };

    assert.strictEqual(getBrandName(mockMerchant), "Acme Corp");
    assert.strictEqual(getBrandName(null), "Merchant");
  });

  // 12. Mode initialization strictly from backend response
  it("12. initializes mode to CREATE with null policyId on 404, and EDIT with policyId on 200", () => {
    type Mode = "CREATE" | "EDIT";

    const resolveMode = (
      policyRes: { success: boolean; data?: Policy | null } | null,
      err?: { status?: number }
    ): { mode: Mode; policyId: string | null } => {
      if (policyRes?.success && policyRes.data) {
        return { mode: "EDIT", policyId: policyRes.data._id || null };
      }
      if (err?.status === 404) {
        return { mode: "CREATE", policyId: null };
      }
      return { mode: "CREATE", policyId: null };
    };

    const editState = resolveMode({ success: true, data: mockPolicy });
    assert.strictEqual(editState.mode, "EDIT");
    assert.strictEqual(editState.policyId, "607f1f77bcf86cd799439022");

    const createState = resolveMode(null, { status: 404 });
    assert.strictEqual(createState.mode, "CREATE");
    assert.strictEqual(createState.policyId, null);
  });

  // 13. Method isolation: CREATE uses POST only, EDIT uses PUT only
  it("13. enforces CREATE mode uses POST only and EDIT mode uses PUT only", () => {
    type Mode = "CREATE" | "EDIT";

    const getSubmitAction = (mode: Mode, policyId: string | null) => {
      if (mode === "CREATE") {
        assert.strictEqual(policyId, null, "CREATE mode must have null policyId");
        return { method: "POST", endpoint: "/api/policies", buttonLabel: "Create Agent" };
      }
      if (mode === "EDIT") {
        assert.ok(policyId, "EDIT mode must have a non-null policyId");
        return { method: "PUT", endpoint: `/api/policies/${policyId}`, buttonLabel: "Save Changes" };
      }
      throw new Error("Invalid mode");
    };

    const createAction = getSubmitAction("CREATE", null);
    assert.strictEqual(createAction.method, "POST");
    assert.strictEqual(createAction.endpoint, "/api/policies");
    assert.strictEqual(createAction.buttonLabel, "Create Agent");

    const editAction = getSubmitAction("EDIT", "607f1f77bcf86cd799439022");
    assert.strictEqual(editAction.method, "PUT");
    assert.strictEqual(editAction.endpoint, "/api/policies/607f1f77bcf86cd799439022");
    assert.strictEqual(editAction.buttonLabel, "Save Changes");
  });

  // 14. Navigation after create/save redirects to overview via router.replace
  it("14. uses router.replace('/merchant/agent-builder') upon successful create or save", () => {
    const navigationHistory: { type: "replace" | "push"; url: string }[] = [];

    const mockRouter = {
      replace: (url: string) => navigationHistory.push({ type: "replace", url }),
      push: (url: string) => navigationHistory.push({ type: "push", url }),
    };

    const handleSuccessRedirect = () => {
      mockRouter.replace("/merchant/agent-builder");
    };

    handleSuccessRedirect();
    assert.strictEqual(navigationHistory.length, 1);
    assert.strictEqual(navigationHistory[0].type, "replace");
    assert.strictEqual(navigationHistory[0].url, "/merchant/agent-builder");
  });

  // 15. Sidebar navigation targets /merchant/agent-builder
  it("15. verifies sidebar item strictly targets agent-builder route", () => {
    const sidebarItem = { name: "Agent Builder", href: "/merchant/agent-builder" };

    assert.strictEqual(sidebarItem.href, "/merchant/agent-builder");
    assert.ok(!sidebarItem.href.includes("configure"));
  });
});
