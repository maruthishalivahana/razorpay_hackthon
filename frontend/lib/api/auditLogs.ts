import { apiClient } from "./client";
import type { AuditCategory, AuditLogResponse } from "@/types/audit";

export interface FetchAuditLogsParams {
    category?: AuditCategory;
    eventType?: string;
    search?: string;
    page?: number;
    pageSize?: number;
    dateFrom?: string;
    dateTo?: string;
}

export async function fetchAuditLogs(params: FetchAuditLogsParams = {}): Promise<AuditLogResponse> {
    const searchParams = new URLSearchParams();
    if (params.category && params.category !== "all") searchParams.set("category", params.category);
    if (params.eventType) searchParams.set("eventType", params.eventType);
    if (params.search?.trim()) searchParams.set("search", params.search.trim());
    if (params.page) searchParams.set("page", String(params.page));
    if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
    if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
    if (params.dateTo) searchParams.set("dateTo", params.dateTo);

    const query = searchParams.toString();
    return apiClient.get<AuditLogResponse>(`/api/audit-logs${query ? `?${query}` : ""}`);
}
