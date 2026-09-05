"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Search,
  Handshake,
  AlertCircle,
  MessageSquareX,
  CheckCircle2,
  Clock,
  CreditCard,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { OrderTable } from "./OrderTable";
import { OrderDetailDialog } from "./OrderDetailDialog";
import { fetchAgreements } from "@/lib/api/agreements";
import { useMerchant } from "@/hooks/useMerchant";
import type { Agreement, AgreementPagination } from "@/types/agreement";

export function OrdersPageContent() {
  const { selectedMerchant, loading: merchantLoading } = useMerchant();

  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [pagination, setPagination] = useState<AgreementPagination | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState<number>(1);

  // Detail Modal state
  const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load agreements callback for manual refresh
  const loadAgreements = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetchAgreements({
        merchantId: selectedMerchant?._id,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        search: debouncedSearch.trim() || undefined,
        page,
        limit: 20,
      });

      if (res.success && Array.isArray(res.data)) {
        setAgreements(res.data);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      } else {
        throw new Error("Invalid API response");
      }
    } catch (err: unknown) {
      console.error("Error loading orders:", err);
      setError("Unable to load orders.");
    } finally {
      setLoading(false);
    }
  }, [selectedMerchant, statusFilter, debouncedSearch, page]);

  useEffect(() => {
    let ignore = false;
    if (!merchantLoading) {
      fetchAgreements({
        merchantId: selectedMerchant?._id,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        search: debouncedSearch.trim() || undefined,
        page,
        limit: 20,
      })
        .then((res) => {
          if (!ignore) {
            if (res.success && Array.isArray(res.data)) {
              setAgreements(res.data);
              if (res.pagination) {
                setPagination(res.pagination);
              }
            }
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!ignore) {
            console.error("Error loading orders:", err);
            setError("Unable to load orders.");
            setLoading(false);
          }
        });
    }
    return () => {
      ignore = true;
    };
  }, [merchantLoading, selectedMerchant, statusFilter, debouncedSearch, page]);

  const handleClearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("ALL");
    setPage(1);
  };

  const handleViewDetail = (item: Agreement) => {
    setSelectedAgreement(item);
    setDialogOpen(true);
  };

  const handleAgreementUpdated = () => {
    loadAgreements();
  };

  const isFilterActive = Boolean(debouncedSearch.trim() || statusFilter !== "ALL");

  // Summary Metrics calculated directly from backend data
  const pendingApprovalCount = agreements.filter((a) => a.status === "PENDING_APPROVAL").length;
  const approvedCount = agreements.filter((a) => a.status === "APPROVED" || a.status === "COMPLETED").length;
  const paymentReadyCount = agreements.filter((a) => a.paymentReady || a.status === "APPROVED").length;
  const totalCount = pagination?.total ?? agreements.length;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track negotiated agreements, approvals, and payment readiness.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadAgreements} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Top Summary Cards */}
      {!loading && !error && agreements.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border shadow-xs">
            <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Pending Approval</CardTitle>
              <Clock className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold text-foreground">{pendingApprovalCount}</div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-xs">
            <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Approved Deals</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold text-foreground">{approvedCount}</div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-xs">
            <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Payment Ready</CardTitle>
              <CreditCard className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold text-foreground">{paymentReadyCount}</div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-xs">
            <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total Orders</CardTitle>
              <Layers className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold text-foreground">{totalCount}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
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
          aria-label="Filter orders by status"
        >
          <option value="ALL">All Statuses</option>
          <option value="PENDING_APPROVAL">Pending Approval</option>
          <option value="APPROVED">Approved</option>
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
        <div className="border border-border rounded-xl p-12 text-center bg-card space-y-4 shadow-xs">
          <div className="inline-flex h-12 w-12 rounded-full bg-destructive/10 text-destructive items-center justify-center">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg text-foreground">Unable to load orders.</h3>
            <p className="text-sm text-muted-foreground">Please check your connection and try again.</p>
          </div>
          <Button variant="outline" onClick={loadAgreements}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      ) : agreements.length === 0 ? (
        isFilterActive ? (
          /* Search Empty State */
          <div className="border border-border rounded-xl p-12 text-center bg-card space-y-4 shadow-xs">
            <div className="inline-flex h-12 w-12 rounded-full bg-muted text-muted-foreground items-center justify-center">
              <MessageSquareX className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg text-foreground">No orders match your filters.</h3>
              <p className="text-sm text-muted-foreground">Try adjusting your search query or status filter.</p>
            </div>
            <Button variant="outline" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          </div>
        ) : (
          /* Empty History State */
          <div className="border border-border rounded-xl p-12 text-center bg-card space-y-4 shadow-xs">
            <div className="inline-flex h-12 w-12 rounded-full bg-primary/10 text-primary items-center justify-center">
              <Handshake className="h-6 w-6" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="font-semibold text-lg text-foreground">No orders yet</h3>
              <p className="text-sm text-muted-foreground">
                Orders will appear here after your Negotiation Agent reaches an agreement with a buyer.
              </p>
            </div>
            <div className="pt-2">
              <Link href="/merchant/negotiations">
                <Button variant="outline" size="sm">
                  View Negotiations
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        )
      ) : (
        /* Orders Table & Pagination */
        <div className="space-y-4">
          <OrderTable agreements={agreements} onViewDetail={handleViewDetail} />

          {/* Pagination Controls */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
              <span>
                Showing {agreements.length} of {pagination.total} orders (Page {pagination.page} of {pagination.totalPages})
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

      {/* Detail Dialog Modal */}
      <OrderDetailDialog
        agreement={selectedAgreement}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onUpdated={handleAgreementUpdated}
      />
    </div>
  );
}
