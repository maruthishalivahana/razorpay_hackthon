import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fetchApprovalByAgreement,
  approveApproval,
  rejectApproval,
} from "../approvals.js";
import type { SingleApprovalApiResponse } from "../approvals.js";
import type { ApproveAgreementResult, RejectAgreementResult } from "@/types/agreement";

describe("Approvals API Client", () => {
  // 1. Fetch approval by agreement ID
  it("1. fetches approval request by agreement ID", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      const mockResponse: SingleApprovalApiResponse = {
        success: true,
        data: {
          _id: "app_1",
          agreementId: "agr_1",
          merchantId: "m123",
          status: "PENDING",
          reason: "Order value exceeds automatic limit",
          requestedAt: new Date().toISOString(),
        },
      };
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const res = await fetchApprovalByAgreement("agr_1");
      assert.ok(requestedUrl.includes("/api/approvals/agreement/agr_1"));
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data?.status, "PENDING");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 2. Approve via approval ID
  it("2. approves agreement via approval ID", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    let requestedMethod = "";

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestedUrl = url.toString();
      requestedMethod = init?.method || "GET";
      const mockResponse: ApproveAgreementResult = {
        success: true,
        data: {
          agreementId: "agr_1",
          status: "APPROVED",
          approvedBy: "Store Manager",
          approvedAt: new Date().toISOString(),
          paymentReady: true,
        },
      };
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const res = await approveApproval("app_1", "Store Manager");
      assert.ok(requestedUrl.includes("/api/approvals/app_1/approve"));
      assert.strictEqual(requestedMethod, "POST");
      assert.strictEqual(res.data.status, "APPROVED");
      assert.strictEqual(res.data.paymentReady, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 3. Reject via approval ID
  it("3. rejects agreement via approval ID with optional reason", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    let requestedMethod = "";

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestedUrl = url.toString();
      requestedMethod = init?.method || "GET";
      const mockResponse: RejectAgreementResult = {
        success: true,
        data: {
          agreementId: "agr_1",
          status: "REJECTED",
          reviewer: "Store Manager",
          reason: "Customer requested cancellation",
          rejectedAt: new Date().toISOString(),
        },
      };
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const res = await rejectApproval("app_1", "Store Manager", "Customer requested cancellation");
      assert.ok(requestedUrl.includes("/api/approvals/app_1/reject"));
      assert.strictEqual(requestedMethod, "POST");
      assert.strictEqual(res.data.status, "REJECTED");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
