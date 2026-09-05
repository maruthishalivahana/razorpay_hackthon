"use client";

import { useState } from "react";
import Link from "next/link";
import {
  X,
  Package,
  Handshake,
  Bot,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  CreditCard,
  Check,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils/format";
import { approveAgreement, rejectAgreement } from "@/lib/api/agreements";
import type { Agreement, PopulatedProduct } from "@/types/agreement";

interface OrderDetailDialogProps {
  agreement: Agreement | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export function OrderDetailDialog({
  agreement,
  open,
  onClose,
  onUpdated,
}: OrderDetailDialogProps) {
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectPromptOpen, setRejectPromptOpen] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [payNowModalOpen, setPayNowModalOpen] = useState<boolean>(false);

  if (!open || !agreement) return null;

  const product = (typeof agreement.productId === "object" ? agreement.productId : null) as PopulatedProduct | null;
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

  const handleApprove = async () => {
    try {
      setActionLoading(true);
      setActionError(null);
      await approveAgreement(agreement._id || agreement.id || "");
      onUpdated?.();
      onClose();
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
      await rejectAgreement(agreement._id || agreement.id || "", "Merchant Reviewer", rejectReason.trim() || undefined);
      setRejectPromptOpen(false);
      onUpdated?.();
      onClose();
    } catch (err: unknown) {
      console.error("Reject failed:", err);
      setActionError(err instanceof Error ? err.message : "Failed to reject agreement.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-6 space-y-6 text-card-foreground">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-foreground">Order & Agreement Details</h2>
              <Badge variant={isApproved ? "success" : isRejected ? "destructive" : "default"}>
                {agreement.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5 text-primary" />
              <span>Negotiated by Agent</span>
              <span>•</span>
              <span className="font-mono text-[11px]">{agreement._id || agreement.id}</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {actionError && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-xs flex items-center gap-2 border border-destructive/20">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Product & Commercial Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Product Card */}
          <div className="p-4 rounded-lg bg-muted/40 border border-border space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Package className="h-4 w-4 text-primary" />
              <span>Product</span>
            </div>
            <div className="flex items-start gap-2.5">
              {productImg ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={productImg}
                  alt={productName}
                  className="h-11 w-11 rounded-md object-cover border border-border shrink-0"
                />
              ) : (
                <div className="h-11 w-11 rounded-md bg-muted/80 flex items-center justify-center border border-border shrink-0">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <h4 className="font-semibold text-sm text-foreground truncate">{productName}</h4>
                <p className="text-xs text-muted-foreground">SKU: {productSku}</p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground pt-1">
              List Price: <span className="font-medium text-foreground">{formatCurrency(listPrice, currency)}</span>
            </div>
          </div>

          {/* Commercial Summary */}
          <div className="p-4 rounded-lg bg-muted/40 border border-border space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Handshake className="h-4 w-4 text-primary" />
              <span>Agreed Terms</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">Agreed Unit Price</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(agreement.agreedUnitPrice, currency)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Total Order Value</span>
                <span className="font-bold text-primary">
                  {formatCurrency(agreement.finalOrderValue, currency)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Quantity</span>
                <span className="font-medium text-foreground">
                  {agreement.quantity} {agreement.quantity === 1 ? "unit" : "units"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Discount</span>
                <span className="font-medium text-foreground">
                  {agreement.discountPercent}% off
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Transaction Lifecycle Timeline */}
        <div className="p-4 rounded-lg border border-border bg-card space-y-3">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Transaction Lifecycle
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
            {/* Step 1: Negotiation */}
            <div className="p-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Negotiated</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Terms accepted</p>
            </div>

            {/* Step 2: Agreement */}
            <div className="p-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Agreement</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Contract created</p>
            </div>

            {/* Step 3: Approval */}
            <div className={`p-2.5 rounded-md border space-y-1 ${
              isApproved
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"
                : isRejected
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : "border-amber-500/30 bg-amber-500/5 text-amber-600"
            }`}>
              <div className="flex items-center gap-1.5 font-semibold">
                {isApproved ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : isRejected ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  <Clock className="h-3.5 w-3.5" />
                )}
                <span>Approval</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isApproved ? "Approved" : isRejected ? "Rejected" : "Pending review"}
              </p>
            </div>

            {/* Step 4: Payment Readiness */}
            <div className={`p-2.5 rounded-md border space-y-1 ${
              isPaymentReady
                ? "border-blue-500/30 bg-blue-500/5 text-blue-600"
                : "border-border bg-muted/20 text-muted-foreground"
            }`}>
              <div className="flex items-center gap-1.5 font-semibold">
                <CreditCard className="h-3.5 w-3.5" />
                <span>Payment</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isPaymentReady ? "Ready for checkout" : "Pending approval"}
              </p>
            </div>
          </div>
        </div>

        {/* Approval Action Banner (When Pending Approval) */}
        {isPendingApproval && (
          <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Merchant Approval Required</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {agreement.approval?.reason || "This negotiated order requires merchant review before payment processing."}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setRejectPromptOpen(true)}
                  disabled={actionLoading}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Reject
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
                      Approve
                    </>
                  )}
                </Button>
              </div>
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
                  placeholder="e.g. Quantity limit exceeded or price margin too low"
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
        )}

        {/* Payment Readiness Section & Pay Now Action */}
        {isPaymentReady && (
          <div className="p-3.5 rounded-lg border border-blue-500/30 bg-blue-500/5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <CreditCard className="h-4 w-4 text-blue-600 shrink-0" />
              <div>
                <span className="font-medium text-foreground block">Payment is Ready</span>
                <span className="text-muted-foreground">
                  Order is approved and customer can proceed to checkout.
                </span>
              </div>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => setPayNowModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-xs h-8"
            >
              Pay Now
            </Button>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            {negotiationId && (
              <Link href={`/merchant/negotiations/${negotiationId}`}>
                <Button variant="outline" size="sm" className="text-xs">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  View Negotiation
                </Button>
              </Link>
            )}
            <Link href={`/merchant/orders/${agreement._id || agreement.id}`}>
              <Button variant="outline" size="sm" className="text-xs">
                Full Details Page
              </Button>
            </Link>
          </div>

          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Pay Now Placeholder Modal */}
        {payNowModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
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
    </div>
  );
}
