import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fetchAgreements,
  fetchAgreementById,
  fetchAgreementPaymentReady,
  approveAgreement,
  rejectAgreement,
} from "../agreements.js";
import type {
  Agreement,
  AgreementsListApiResponse,
  SingleAgreementApiResponse,
  PaymentReadyApiResponse,
  ApproveAgreementResult,
  RejectAgreementResult,
} from "@/types/agreement";

describe("Agreements API Client", () => {
  // 1. List URL
  it("1. builds list URL with merchant scoping and default parameters", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      const mockResponse: AgreementsListApiResponse = {
        success: true,
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      };
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const res = await fetchAgreements({
        merchantId: "m123",
      });

      assert.ok(requestedUrl.includes("/api/agreements?merchantId=m123"));
      assert.strictEqual(res.success, true);
      assert.deepEqual(res.data, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 2. Search query
  it("2. passes search query parameter to backend endpoint", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      const mockResponse: AgreementsListApiResponse = {
        success: true,
        data: [
          {
            _id: "agr_1",
            negotiationId: "neg_1",
            merchantId: "m123",
            productId: { name: "MacBook Pro 14", sku: "MBP14", price: 120000 },
            status: "APPROVED",
            quantity: 1,
            currency: "INR",
            originalUnitPrice: 120000,
            agreedUnitPrice: 115000,
            discountPercent: 4.17,
            finalOrderValue: 115000,
            marginPercent: 25,
            paymentReady: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const res = await fetchAgreements({
        merchantId: "m123",
        search: "MacBook",
      });

      assert.ok(requestedUrl.includes("search=MacBook"));
      assert.strictEqual(res.data.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 3. Status filter
  it("3. passes status filter when specific status is selected, omits ALL", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrls.push(url.toString());
      return new Response(
        JSON.stringify({ success: true, data: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      await fetchAgreements({ merchantId: "m123", status: "PENDING_APPROVAL" });
      await fetchAgreements({ merchantId: "m123", status: "ALL" });

      assert.ok(requestedUrls[0].includes("status=PENDING_APPROVAL"));
      assert.ok(!requestedUrls[1].includes("status="));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 4. Pagination
  it("4. includes page and limit pagination parameters correctly", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      return new Response(
        JSON.stringify({
          success: true,
          data: [],
          pagination: { page: 2, limit: 10, total: 20, totalPages: 2 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await fetchAgreements({
        page: 2,
        limit: 10,
      });

      assert.ok(requestedUrl.includes("page=2"));
      assert.ok(requestedUrl.includes("limit=10"));
      assert.strictEqual(res.pagination?.page, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 5. Detail URL
  it("5. fetches single agreement details by ID", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    const mockDetail: Agreement = {
      _id: "agr_detail_1",
      negotiationId: "neg_1",
      merchantId: { _id: "m123", name: "Merchant Test", businessName: "Acme Store", email: "acme@example.com" },
      productId: { _id: "p1", name: "Ergonomic Chair", sku: "CHAIR-001", price: 10000 },
      status: "APPROVED",
      quantity: 2,
      currency: "INR",
      originalUnitPrice: 10000,
      agreedUnitPrice: 9000,
      discountPercent: 10,
      finalOrderValue: 18000,
      marginPercent: 22.2,
      paymentReady: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approval: {
        agreementId: "agr_detail_1",
        merchantId: "m123",
        status: "APPROVED",
        reviewer: "Admin",
        requestedAt: new Date().toISOString(),
      },
    };

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      const mockResponse: SingleAgreementApiResponse = {
        success: true,
        data: mockDetail,
      };
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const res = await fetchAgreementById("agr_detail_1");

      assert.ok(requestedUrl.includes("/api/agreements/agr_detail_1"));
      assert.strictEqual(res.data._id, "agr_detail_1");
      assert.strictEqual(res.data.paymentReady, true);
      assert.strictEqual(res.data.finalOrderValue, 18000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 6. Payment Readiness
  it("6. checks payment readiness for an agreement", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      const mockResponse: PaymentReadyApiResponse = {
        success: true,
        data: { paymentReady: true },
      };
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const res = await fetchAgreementPaymentReady("agr_1");
      assert.ok(requestedUrl.includes("/api/agreements/agr_1/payment-ready"));
      assert.strictEqual(res.data.paymentReady, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 7. Approve Agreement
  it("7. calls approve endpoint with reviewer", async () => {
    const originalFetch = globalThis.fetch;
    let requestedMethod = "";
    let requestBody: Record<string, unknown> | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestedMethod = init?.method || "GET";
      requestBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      const mockResponse: ApproveAgreementResult = {
        success: true,
        data: {
          agreementId: "agr_1",
          status: "APPROVED",
          approvedBy: "Merchant Owner",
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
      const res = await approveAgreement("agr_1", "Merchant Owner");
      const body = requestBody as Record<string, unknown> | null;
      assert.strictEqual(requestedMethod, "POST");
      assert.strictEqual(body?.reviewer, "Merchant Owner");
      assert.strictEqual(res.data.status, "APPROVED");
      assert.strictEqual(res.data.paymentReady, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 8. Reject Agreement
  it("8. calls reject endpoint with reviewer and reason", async () => {
    const originalFetch = globalThis.fetch;
    let requestedMethod = "";
    let requestBody: Record<string, unknown> | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestedMethod = init?.method || "GET";
      requestBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      const mockResponse: RejectAgreementResult = {
        success: true,
        data: {
          agreementId: "agr_1",
          status: "REJECTED",
          reviewer: "Merchant Owner",
          reason: "Margin too low",
          rejectedAt: new Date().toISOString(),
        },
      };
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const res = await rejectAgreement("agr_1", "Merchant Owner", "Margin too low");
      const body = requestBody as Record<string, unknown> | null;
      assert.strictEqual(requestedMethod, "POST");
      assert.strictEqual(body?.reviewer, "Merchant Owner");
      assert.strictEqual(body?.reason, "Margin too low");
      assert.strictEqual(res.data.status, "REJECTED");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
