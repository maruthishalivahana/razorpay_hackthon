import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchAuditLogs } from "../auditLogs";
import type { AuditLogResponse } from "@/types/audit";

describe("Audit Logs API Client", () => {
    it("uses the merchant-scoped audit endpoint with server-side filters and pagination", async () => {
        const originalFetch = globalThis.fetch;
        let requestedUrl = "";

        globalThis.fetch = (async (url: string | URL | Request) => {
            requestedUrl = url.toString();
            const response: AuditLogResponse = {
                success: true,
                data: { items: [], page: 2, pageSize: 25, total: 30, hasMore: false },
            };
            return new Response(JSON.stringify(response), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }) as typeof fetch;

        try {
            const result = await fetchAuditLogs({
                category: "policy",
                search: "MacBook",
                page: 2,
                pageSize: 25,
                dateFrom: "2026-09-01",
            });

            const url = new URL(requestedUrl);
            assert.strictEqual(url.pathname, "/api/audit-logs");
            assert.strictEqual(url.searchParams.get("category"), "policy");
            assert.strictEqual(url.searchParams.get("search"), "MacBook");
            assert.strictEqual(url.searchParams.get("page"), "2");
            assert.strictEqual(url.searchParams.get("pageSize"), "25");
            assert.strictEqual(url.searchParams.get("dateFrom"), "2026-09-01");
            assert.strictEqual(result.data.total, 30);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
