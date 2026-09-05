"use client";

import { useCallback, useEffect, useState } from "react";
import {
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    RefreshCw,
    Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAuditLogs } from "@/lib/api/auditLogs";
import { formatCurrency } from "@/lib/utils/format";
import type { AuditCategory, AuditEvent } from "@/types/audit";

const filters: { label: string; value: AuditCategory }[] = [
    { label: "All", value: "all" },
    { label: "Negotiation", value: "negotiation" },
    { label: "Policy", value: "policy" },
    { label: "Orders", value: "order" },
    { label: "Payments", value: "payment" },
    { label: "Inventory", value: "inventory" },
    { label: "Errors", value: "errors" },
];

function formatTimestamp(value: string) {
    return new Date(value).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function getEventLabel(eventType: string) {
    return eventType.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getEventStatus(event: AuditEvent) {
    const data = event.data || {};
    const decision = data.decision || data.status || data.paymentStatus;
    return typeof decision === "string" ? decision.replaceAll("_", " ") : "Recorded";
}

function getRelatedObject(event: AuditEvent) {
    const data = event.data || {};
    if (typeof data.productName === "string") return data.productName;
    if (event.productId) return `Product ${event.productId.slice(-8)}`;
    if (event.orderId) return `Order ${event.orderId.slice(-8)}`;
    if (event.agreementId) return `Agreement ${event.agreementId.slice(-8)}`;
    if (event.negotiationId) return `Negotiation ${event.negotiationId.slice(-8)}`;
    return "Commerce activity";
}

function getAmount(event: AuditEvent) {
    const data = event.data || {};
    const amount = data.amount ?? data.finalOrderValue ?? data.calculatedFinalPrice;
    return typeof amount === "number" ? formatCurrency(amount, typeof data.currency === "string" ? data.currency : "INR") : null;
}

function getMetadataSummary(event: AuditEvent) {
    const data = event.data || {};
    const keys = [
        ["Requested discount", "requestedDiscountPercent"],
        ["Maximum discount", "maximumDiscountPercent"],
        ["Minimum margin", "minimumProfitMarginPercent"],
        ["Calculated margin", "calculatedMarginPercent"],
        ["Approval required", "approvalRequired"],
        ["Quantity", "quantity"],
        ["Stock before", "quantityBefore"],
        ["Stock after", "quantityAfter"],
        ["Reason", "reason"],
    ] as const;
    return keys
        .filter(([, key]) => data[key] !== undefined)
        .map(([label, key]) => `${label}: ${String(data[key])}`)
        .join(" · ");
}

export function AuditLogsPageContent() {
    const [events, setEvents] = useState<AuditEvent[]>([]);
    const [category, setCategory] = useState<AuditCategory>("all");
    const [search, setSearch] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadLogs = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetchAuditLogs({
                category,
                search,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo ? `${dateTo}T23:59:59.999` : undefined,
                page,
                pageSize: 25,
            });
            setEvents(response.data.items);
            setTotal(response.data.total);
            setHasMore(response.data.hasMore);
        } catch (err) {
            console.error("Error loading audit logs:", err);
            setError("Unable to load audit logs.");
        } finally {
            setLoading(false);
        }
    }, [category, dateFrom, dateTo, page, search]);

    useEffect(() => {
        const timer = setTimeout(() => void loadLogs(), 250);
        return () => clearTimeout(timer);
    }, [loadLogs]);

    const changeCategory = (value: AuditCategory) => {
        setCategory(value);
        setPage(1);
    };

    const changeSearch = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    const firstItem = total === 0 ? 0 : (page - 1) * 25 + 1;
    const lastItem = Math.min(page * 25, total);

    return (
        <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Audit Logs</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Track agent decisions, transactions, payments, inventory changes, and failures.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void loadLogs()} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            <Card className="border-border shadow-xs">
                <CardContent className="p-4 space-y-4">
                    <div className="flex flex-col lg:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(event) => changeSearch(event.target.value)}
                                placeholder="Search audit logs..."
                                className="pl-9"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} aria-label="Start date" />
                            <Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} aria-label="End date" />
                        </div>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {filters.map((filter) => (
                            <Button
                                key={filter.value}
                                variant={category === filter.value ? "default" : "outline"}
                                size="sm"
                                onClick={() => changeCategory(filter.value)}
                                className="shrink-0"
                            >
                                {filter.label}
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {loading ? (
                <Card className="border-border">
                    <CardContent className="p-5 space-y-4">
                        {[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-14 w-full" />)}
                    </CardContent>
                </Card>
            ) : error ? (
                <Card className="border-border">
                    <CardContent className="p-12 text-center space-y-4">
                        <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
                        <p className="text-sm text-muted-foreground">{error}</p>
                        <Button variant="outline" onClick={() => void loadLogs()}>Retry</Button>
                    </CardContent>
                </Card>
            ) : events.length === 0 ? (
                <Card className="border-border">
                    <CardContent className="p-12 text-center space-y-3">
                        <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="font-medium text-foreground">No audit events found</p>
                        <p className="text-sm text-muted-foreground">Commerce activity matching these filters will appear here.</p>
                    </CardContent>
                </Card>
            ) : (
                <Card className="border-border shadow-xs overflow-hidden">
                    <CardHeader className="p-4 border-b border-border bg-muted/20">
                        <CardTitle className="text-sm font-semibold">Activity Timeline</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="hidden md:grid grid-cols-[1.2fr_1.5fr_0.8fr_1fr_1fr] gap-4 px-5 py-3 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <span>When</span><span>Event</span><span>Actor</span><span>Related object</span><span>Decision / amount</span>
                        </div>
                        <div className="divide-y divide-border">
                            {events.map((event) => {
                                const amount = getAmount(event);
                                const metadata = getMetadataSummary(event);
                                return (
                                    <div key={event._id} className="px-5 py-4 grid grid-cols-1 md:grid-cols-[1.2fr_1.5fr_0.8fr_1fr_1fr] gap-2 md:gap-4 hover:bg-muted/30">
                                        <div className="text-xs text-muted-foreground">{formatTimestamp(event.createdAt)}</div>
                                        <div>
                                            <div className="font-semibold text-sm text-foreground">{getEventLabel(event.eventType)}</div>
                                            <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                                            {metadata && <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{metadata}</p>}
                                        </div>
                                        <div><Badge variant="outline" className="font-normal">{event.actorType.replaceAll("_", " ")}</Badge></div>
                                        <div className="text-sm text-foreground break-words">{getRelatedObject(event)}</div>
                                        <div className="flex flex-col items-start gap-1">
                                            <Badge variant={event.eventType.includes("FAILED") || event.eventType.includes("UNAVAILABLE") ? "destructive" : "secondary"} className="font-normal">
                                                {getEventStatus(event)}
                                            </Badge>
                                            {amount && <span className="font-semibold text-sm text-foreground">{amount}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{total === 0 ? "No events" : `Showing ${firstItem}-${lastItem} of ${total}`}</span>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage((current) => current - 1)} disabled={page === 1 || loading}>
                        <ChevronLeft className="h-4 w-4" /> Previous
                    </Button>
                    <span>Page {page}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage((current) => current + 1)} disabled={!hasMore || loading}>
                        Next <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
