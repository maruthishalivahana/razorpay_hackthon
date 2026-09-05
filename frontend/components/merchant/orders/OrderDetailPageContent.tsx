"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  Package,
  Handshake,
  Bot,
  Truck,
  Clock,
  AlertCircle,
  Activity,
  CheckCircle2,
  XCircle,
  CreditCard,
  Check,
  X,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils/format";
import { fetchAgreementById, approveAgreement, rejectAgreement } from "@/lib/api/agreements";
import type {
  Agreement,
  PopulatedProduct,
  PopulatedMerchant,
  PopulatedPolicy,
} from "@/types/agreement";
import type { AuditEventInfo } from "@/types/negotiation";

interface OrderDetailPageContentProps {
  orderId: string;
}

export function OrderDetailPageContent({ orderId }: OrderDetailPageContentProps) {
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"lifecycle" | "audit">("lifecycle");

  // Approval action states
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [rejectPromptOpen, setRejectPromptOpen] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [payNowModalOpen, setPayNowModalOpen] = useState<boolean>(false);

  const loadAgreement = useCallback(async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAgreementById(orderId);
      if (res.success && res.data) {
        setAgreement(res.data);
      } else {
        throw new Error("Order not found");
      }
    } catch (err: unknown) {
      console.error("Failed to load order details:", err);
      const msg = err instanceof Error ? err.message : "Unable to load order details.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    let ignore = false;
    if (orderId) {
      fetchAgreementById(orderId)
        .then((res) => {
          if (!ignore) {
            if (res.success && res.data) {
              setAgreement(res.data);
            }
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!ignore) {
            console.error("Failed to load order details:", err);
            setError(err instanceof Error ? err.message : "Unable to load order details.");
            setLoading(false);
          }
        });
    }
    return () => {
      ignore = true;
    };
  }, [orderId]);

  const handleApprove = async () => {
    try {
      setActionLoading(true);
      setActionError(null);
      setActionSuccess(null);
      await approveAgreement(orderId);
      setActionSuccess("Agreement approved successfully.");
      await loadAgreement();
    } catch (err: unknown) {
      console.error("Approve failed:", err);
      setActionError(err instanceof Error ? err.message : "Failed to approve agreement.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    try {
      setActionLoading(true);
      setActionError(null);
      setActionSuccess(null);
      await rejectAgreement(orderId, "Merchant Reviewer", rejectReason.trim() || undefined);
      setActionSuccess("Agreement rejected.");
      setRejectPromptOpen(false);
      await loadAgreement();
    } catch (err: unknown) {
      console.error("Reject failed:", err);
      setActionError(err instanceof Error ? err.message : "Failed to reject agreement.");
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "APPROVED":
        return <Badge variant="success" className="font-medium">Approved</Badge>;
      case "PENDING_APPROVAL":
        return <Badge variant="default" className="bg-amber-600 hover:bg-amber-700 font-medium">Pending Approval</Badge>;
      case "REJECTED":
        return <Badge variant="destructive" className="font-medium">Rejected</Badge>;
      case "EXPIRED":
        return <Badge variant="secondary" className="font-medium">Expired</Badge>;
      case "COMPLETED":
        return <Badge variant="success" className="bg-emerald-700 font-medium">Completed</Badge>;
      default:
        return <Badge variant="outline" className="font-medium">{status || "Unknown"}</Badge>;
    }
  };

  const formatTimestamp = (dateVal?: string | Date) => {
    if (!dateVal) return "—";
    try {
      const d = new Date(dateVal);
      return d.toLocaleString("en-IN", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(dateVal);
    }
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div className="lg:col-span-2">
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !agreement) {
    return (
      <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
        <div className="border border-border rounded-xl p-10 text-center bg-card space-y-4 shadow-xs">
          <div className="inline-flex h-12 w-12 rounded-full bg-destructive/10 text-destructive items-center justify-center">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg text-foreground">Unable to load order details.</h3>
            <p className="text-sm text-muted-foreground">{error || "The requested order could not be found."}</p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <Link href="/merchant/orders">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Orders
              </Button>
            </Link>
            <Button onClick={loadAgreement}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const product = (typeof agreement.productId === "object" ? agreement.productId : null) as PopulatedProduct | null;
  const merchant = (typeof agreement.merchantId === "object" ? agreement.merchantId : null) as PopulatedMerchant | null;
  const policy = (typeof agreement.policyId === "object" ? agreement.policyId : null) as PopulatedPolicy | null;

  const productName = product?.name || "Product";
  const productSku = product?.sku || "N/A";
  const productImg = product?.imageUrl;
  const listPrice = agreement.originalUnitPrice || product?.price || 0;
  const currency = agreement.currency || "INR";
  const negotiationId = typeof agreement.negotiationId === "object" ? agreement.negotiationId._id || agreement.negotiationId.id : agreement.negotiationId;

  const isApproved = agreement.status === "APPROVED" || agreement.status === "COMPLETED";
  const isPendingApproval = agreement.status === "PENDING_APPROVAL";
  const isRejected = agreement.status === "REJECTED";
  const isPaymentReady = agreement.paymentReady || isApproved;
  const auditEvents: AuditEventInfo[] = agreement.auditEvents || [];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link href="/merchant/orders">
            <Button variant="ghost" size="sm" className="h-9 px-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <Separator orientation="vertical" className="h-5 hidden sm:block" />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                Order Details
              </h1>
              {getStatusBadge(agreement.status)}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Bot className="h-3.5 w-3.5 text-primary" />
              <span>Negotiated Agreement</span>
              <span>•</span>
              <span className="font-mono">{agreement._id || agreement.id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadAgreement} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 rounded-md bg-emerald-500/10 text-emerald-600 text-xs flex items-center gap-2 border border-emerald-500/20">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-xs flex items-center gap-2 border border-destructive/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Commercial & Product Summary */}
        <div className="space-y-6 lg:col-span-1">
          {/* Commercial Terms Card */}
          <Card className="border-border shadow-xs">
            <CardHeader className="p-4 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Handshake className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold text-foreground">Order Terms</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded-md bg-muted/30 border border-border">
                  <span className="text-muted-foreground block text-[11px]">Agreed Unit Price</span>
                  <span className="font-semibold text-sm text-foreground">
                    {formatCurrency(agreement.agreedUnitPrice, currency)}
                  </span>
                </div>

                <div className="p-2.5 rounded-md bg-primary/5 border border-primary/20">
                  <span className="text-muted-foreground block text-[11px]">Total Order Value</span>
                  <span className="font-bold text-sm text-primary">
                    {formatCurrency(agreement.finalOrderValue, currency)}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Quantity</span>
                  <span className="font-medium text-foreground">
                    {agreement.quantity} {agreement.quantity === 1 ? "unit" : "units"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium text-foreground">
                    {agreement.discountPercent}% off
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Original Unit Price</span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(listPrice, currency)}
                  </span>
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-muted-foreground">Payment Readiness</span>
                  {isPaymentReady ? (
                    <Badge variant="outline" className="text-blue-600 border-blue-500/30 bg-blue-500/10 font-normal">
                      Ready for Checkout
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="font-normal">
                      Pending Approval
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Product Information Card */}
          <Card className="border-border shadow-xs">
            <CardHeader className="p-4 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold text-foreground">Product Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                {productImg ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={productImg}
                    alt={productName}
                    className="h-12 w-12 rounded-md object-cover border border-border shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-muted/80 flex items-center justify-center border border-border shrink-0">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="font-semibold text-sm text-foreground truncate">{productName}</h4>
                  <p className="text-xs text-muted-foreground">SKU: {productSku}</p>
                  {product?.category && (
                    <p className="text-xs text-muted-foreground mt-0.5">Category: {product.category}</p>
                  )}
                </div>
              </div>

              {product?.deliveryDays !== undefined && (
                <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5 text-primary" />
                    Delivery Timeline
                  </span>
                  <span className="font-medium text-foreground">{product.deliveryDays} days</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Metadata & Origin Card */}
          <Card className="border-border shadow-xs">
            <CardHeader className="p-4 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold text-foreground">Order Metadata</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Buyer</span>
                <span className="font-medium text-foreground">Buyer 1</span>
              </div>

              {merchant?.businessName && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Merchant</span>
                  <span className="font-medium text-foreground">{merchant.businessName}</span>
                </div>
              )}

              {policy?.name && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Policy Applied</span>
                  <span className="font-medium text-foreground truncate max-w-[150px]">{policy.name}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium text-foreground">
                  {formatTimestamp(agreement.createdAt)}
                </span>
              </div>

              {agreement.approvedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Approved</span>
                  <span className="font-medium text-foreground">
                    {formatTimestamp(agreement.approvedAt)}
                  </span>
                </div>
              )}

              {negotiationId && (
                <div className="pt-2 border-t border-border">
                  <Link href={`/merchant/negotiations/${negotiationId}`}>
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      View Origin Negotiation
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Transaction Lifecycle & Activity Tabs */}
        <div className="space-y-4 lg:col-span-2">
          {/* Navigation Tabs */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab("lifecycle")}
              className={`pb-2.5 px-4 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === "lifecycle"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              Transaction Lifecycle & Approvals
            </button>

            {auditEvents.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("audit")}
                className={`pb-2.5 px-4 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
                  activeTab === "audit"
                    ? "border-primary text-primary font-semibold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Activity className="h-4 w-4" />
                Audit Trail ({auditEvents.length})
              </button>
            )}
          </div>

          {/* TAB 1: Lifecycle & Approval */}
          {activeTab === "lifecycle" && (
            <div className="space-y-6">
              {/* Lifecycle Progress Card */}
              <Card className="border-border shadow-xs">
                <CardHeader className="p-4 border-b border-border bg-muted/10">
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Transaction Stages
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                    {/* Step 1: Negotiation */}
                    <div className="p-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 space-y-1">
                      <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Negotiation</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Terms accepted</p>
                    </div>

                    {/* Step 2: Agreement */}
                    <div className="p-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 space-y-1">
                      <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Agreement</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Contract created</p>
                    </div>

                    {/* Step 3: Approval */}
                    <div className={`p-3 rounded-md border space-y-1 ${
                      isApproved
                        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"
                        : isRejected
                        ? "border-destructive/30 bg-destructive/5 text-destructive"
                        : "border-amber-500/30 bg-amber-500/5 text-amber-600"
                    }`}>
                      <div className="flex items-center gap-1.5 font-semibold">
                        {isApproved ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : isRejected ? (
                          <XCircle className="h-4 w-4" />
                        ) : (
                          <Clock className="h-4 w-4" />
                        )}
                        <span>Approval</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {isApproved ? "Approved" : isRejected ? "Rejected" : "Pending review"}
                      </p>
                    </div>

                    {/* Step 4: Payment */}
                    <div className={`p-3 rounded-md border space-y-1 ${
                      isPaymentReady
                        ? "border-blue-500/30 bg-blue-500/5 text-blue-600"
                        : "border-border bg-muted/20 text-muted-foreground"
                    }`}>
                      <div className="flex items-center gap-1.5 font-semibold">
                        <CreditCard className="h-4 w-4" />
                        <span>Payment</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {isPaymentReady ? "Ready for checkout" : "Pending approval"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Approval Review Section */}
              <Card className="border-border shadow-xs">
                <CardHeader className="p-4 border-b border-border bg-muted/10">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-foreground">
                      Approval Status
                    </CardTitle>
                    {isApproved ? (
                      <Badge variant="success">Approved</Badge>
                    ) : isRejected ? (
                      <Badge variant="destructive">Rejected</Badge>
                    ) : (
                      <Badge variant="default" className="bg-amber-600">Pending Review</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {isPendingApproval ? (
                    /* Action Controls for Pending Agreement */
                    <div className="space-y-3 p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/5">
                      <div>
                        <h4 className="text-xs font-semibold text-foreground">Merchant Action Required</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {agreement.approval?.reason || "This order exceeds the auto-approval threshold and requires merchant authorization."}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setRejectPromptOpen(true)}
                          disabled={actionLoading}
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Reject Order
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleApprove}
                          disabled={actionLoading}
                        >
                          {actionLoading ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                              Approving...
                            </>
                          ) : (
                            <>
                              <Check className="h-3.5 w-3.5 mr-1" />
                              Approve Order
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Rejection Prompt Form */}
                      {rejectPromptOpen && (
                        <div className="pt-3 border-t border-amber-500/20 space-y-2">
                          <label className="text-xs font-medium text-foreground block">
                            Rejection Reason (Optional):
                          </label>
                          <Input
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="e.g. Price margin too low or inventory constraint"
                            className="text-xs h-8"
                          />
                          <div className="flex justify-end gap-2 pt-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRejectPromptOpen(false)}
                              disabled={actionLoading}
                              className="h-7 text-xs"
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={handleReject}
                              disabled={actionLoading}
                              className="h-7 text-xs"
                            >
                              {actionLoading ? "Rejecting..." : "Confirm Rejection"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : isApproved ? (
                    /* Approved State Details */
                    <div className="space-y-2 text-xs">
                      <p className="text-foreground">
                        This agreement has been approved and is ready for payment.
                      </p>
                      {agreement.approval?.reviewer && (
                        <div className="flex items-center justify-between text-muted-foreground pt-1 border-t border-border">
                          <span>Reviewed By</span>
                          <span className="font-medium text-foreground">{agreement.approval.reviewer}</span>
                        </div>
                      )}
                      {agreement.approvedAt && (
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>Approved At</span>
                          <span className="font-medium text-foreground">{formatTimestamp(agreement.approvedAt)}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Rejected State Details */
                    <div className="space-y-2 text-xs">
                      <p className="text-destructive font-medium">
                        This agreement was rejected.
                      </p>
                      {agreement.approval?.reason && (
                        <p className="text-muted-foreground">
                          Reason: {agreement.approval.reason}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payment Readiness & Pay Now Section */}
              {isPaymentReady && (
                <Card className="border-border shadow-xs border-blue-500/30 bg-blue-500/5">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Payment is Ready</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Order for {formatCurrency(agreement.finalOrderValue, currency)} is verified and payment ready.
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setPayNowModalOpen(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-xs shrink-0"
                    >
                      Pay Now
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* TAB 2: Audit Trail */}
          {activeTab === "audit" && (
            <Card className="border-border shadow-xs">
              <CardHeader className="p-4 border-b border-border bg-muted/10">
                <CardTitle className="text-sm font-semibold text-foreground">
                  Order & Agreement Audit Trail
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {auditEvents.length > 0 ? (
                  <div className="space-y-2">
                    {auditEvents.map((event, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-md border border-border bg-card flex items-start justify-between text-xs gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {event.eventType}
                            </Badge>
                            <span className="font-semibold text-foreground">{event.actorType}</span>
                          </div>
                          <p className="text-muted-foreground text-xs">{event.description}</p>
                        </div>
                        <span className="text-muted-foreground text-[11px] shrink-0">
                          {formatTimestamp(event.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-muted-foreground italic">
                    No audit events recorded for this agreement.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Pay Now Placeholder Modal */}
      {payNowModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-card border border-border rounded-xl p-6 space-y-4 shadow-xl text-center">
            <div className="inline-flex h-12 w-12 rounded-full bg-blue-500/10 text-blue-600 items-center justify-center mx-auto">
              <CreditCard className="h-6 w-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-semibold text-lg text-foreground">Payment is Ready</h3>
              <p className="text-xs text-muted-foreground">
                Order for {formatCurrency(agreement.finalOrderValue, currency)} is verified and payment ready.
              </p>
              <p className="text-xs text-primary font-medium pt-1">
                Razorpay Checkout will be connected here.
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => setPayNowModalOpen(false)}
              className="w-full"
            >
              Close Placeholder
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
