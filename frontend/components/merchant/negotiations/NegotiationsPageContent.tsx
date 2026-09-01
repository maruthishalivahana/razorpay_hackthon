"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Search, Handshake, AlertCircle, MessageSquareX, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { NegotiationTable } from "./NegotiationTable";
import { NegotiationDetailDialog } from "./NegotiationDetailDialog";
import { fetchNegotiations } from "@/lib/api/negotiations";
import { useMerchant } from "@/hooks/useMerchant";
import type { Negotiation, NegotiationPagination } from "@/types/negotiation";

export function NegotiationsPageContent() {
  const { selectedMerchant, loading: merchantLoading } = useMerchant();

  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [pagination, setPagination] = useState<NegotiationPagination | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState<number>(1);

  // Detail Modal state
  const [selectedNegotiation, setSelectedNegotiation] = useState<Negotiation | null>(null);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load negotiations
  const loadNegotiations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetchNegotiations({
        merchantId: selectedMerchant?._id,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        search: debouncedSearch.trim() || undefined,
        page,
        limit: 20,
      });

      if (res.success && Array.isArray(res.data)) {
        setNegotiations(res.data);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      } else {
        throw new Error("Invalid API response");
      }
    } catch (err: any) {
      console.error("Error loading negotiations:", err);
      setError("Unable to load negotiations.");
    } finally {
      setLoading(false);
    }
  }, [selectedMerchant?._id, statusFilter, debouncedSearch, page]);

  useEffect(() => {
    if (!merchantLoading) {
      loadNegotiations();
    }
  }, [merchantLoading, loadNegotiations]);

  const handleClearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("ALL");
    setPage(1);
  };

  const handleViewDetail = (item: Negotiation) => {
    setSelectedNegotiation(item);
    setDialogOpen(true);
  };

  const isFilterActive = Boolean(debouncedSearch.trim() || statusFilter !== "ALL");

  // Summary Metrics
  const activeCount = negotiations.filter((n) => n.status === "ACTIVE").length;
  const acceptedCount = negotiations.filter((n) => n.status === "ACCEPTED").length;
  const totalCount = pagination?.total ?? negotiations.length;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Negotiations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor and manage buyer negotiations handled by your commerce agent.
          </p>
        </div>
        <div className="shrink-0">
          <Button variant="outline" size="sm" onClick={loadNegotiations} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {!loading && !error && negotiations.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-border shadow-sm">
            <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Active Negotiations</CardTitle>
              <Clock className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold text-foreground">{activeCount}</div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Accepted Deals</CardTitle>
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold text-foreground">{acceptedCount}</div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total Handled</CardTitle>
              <Handshake className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold text-foreground">{totalCount}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search negotiations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 px-3 rounded-md border border-input bg-card text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="REJECTED">Rejected</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      {/* Content States */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <div className="border border-border rounded-lg p-12 text-center bg-card space-y-4">
          <div className="inline-flex h-12 w-12 rounded-full bg-destructive/10 text-destructive items-center justify-center">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg text-foreground">Unable to load negotiations.</h3>
            <p className="text-sm text-muted-foreground">Please check your connection and try again.</p>
          </div>
          <Button variant="outline" onClick={loadNegotiations}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      ) : negotiations.length === 0 ? (
        isFilterActive ? (
          /* Search Empty State */
          <div className="border border-border rounded-lg p-12 text-center bg-card space-y-4">
            <div className="inline-flex h-12 w-12 rounded-full bg-muted text-muted-foreground items-center justify-center">
              <MessageSquareX className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg text-foreground">No negotiations match your filters.</h3>
              <p className="text-sm text-muted-foreground">Try adjusting your search query or status filter.</p>
            </div>
            <Button variant="outline" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          </div>
        ) : (
          /* Empty History State */
          <div className="border border-border rounded-lg p-12 text-center bg-card space-y-4">
            <div className="inline-flex h-12 w-12 rounded-full bg-primary/10 text-primary items-center justify-center">
              <Handshake className="h-6 w-6" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="font-semibold text-lg text-foreground">No negotiations yet</h3>
              <p className="text-sm text-muted-foreground">
                Buyer negotiations will appear here when your commerce agent starts negotiating with customers.
              </p>
            </div>
          </div>
        )
      ) : (
        /* Negotiations Table */
        <div className="space-y-4">
          <NegotiationTable negotiations={negotiations} onViewDetail={handleViewDetail} />

          {/* Pagination Controls */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
              <span>
                Showing {negotiations.length} of {pagination.total} negotiations (Page {pagination.page} of {pagination.totalPages})
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Dialog */}
      <NegotiationDetailDialog
        negotiation={selectedNegotiation}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
