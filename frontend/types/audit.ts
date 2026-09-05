export type AuditCategory = "all" | "negotiation" | "policy" | "order" | "payment" | "inventory" | "errors";

export interface AuditEvent {
    _id: string;
    merchantId: string;
    eventType: string;
    actorType: string;
    actorId?: string;
    description: string;
    negotiationId?: string;
    agreementId?: string;
    approvalId?: string;
    orderId?: string;
    paymentId?: string;
    productId?: string;
    data?: Record<string, unknown>;
    createdAt: string;
}

export interface AuditLogResponse {
    success: boolean;
    data: {
        items: AuditEvent[];
        page: number;
        pageSize: number;
        total: number;
        hasMore: boolean;
    };
}
