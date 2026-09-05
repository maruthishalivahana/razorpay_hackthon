"use client";

import Link from "next/link";
import { Eye, Bot, Package, CheckCircle2, Clock, XCircle, CreditCard } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import type { Agreement, PopulatedProduct } from "@/types/agreement";

interface OrderTableProps {
  agreements: Agreement[];
  onViewDetail?: (agreement: Agreement) => void;
}

export function OrderTable({ agreements, onViewDetail }: OrderTableProps) {
  const getAgreementStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <Badge variant="success" className="font-normal">Approved</Badge>;
      case "PENDING_APPROVAL":
        return <Badge variant="default" className="bg-amber-600 hover:bg-amber-700 font-normal">Pending Approval</Badge>;
      case "REJECTED":
        return <Badge variant="destructive" className="font-normal">Rejected</Badge>;
      case "EXPIRED":
        return <Badge variant="secondary" className="font-normal">Expired</Badge>;
      case "COMPLETED":
        return <Badge variant="success" className="bg-emerald-700 font-normal">Completed</Badge>;
      case "DRAFT":
      default:
        return <Badge variant="outline" className="font-normal">{status}</Badge>;
    }
  };

  const getApprovalStatusBadge = (agreement: Agreement) => {
    const approval = agreement.approval;
    const approvalStatus = approval?.status || (agreement.status === "APPROVED" ? "APPROVED" : agreement.status === "REJECTED" ? "REJECTED" : "PENDING");

    switch (approvalStatus) {
      case "APPROVED":
        return (
          <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-500/10 font-normal flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Approved
          </Badge>
        );
      case "PENDING":
        return (
          <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/10 font-normal flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case "REJECTED":
        return (
          <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10 font-normal flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Rejected
          </Badge>
        );
      default:
        return <Badge variant="outline" className="font-normal">{approvalStatus}</Badge>;
    }
  };

  const getPaymentStatusBadge = (agreement: Agreement) => {
    if (agreement.status === "COMPLETED") {
      return (
        <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-500/10 font-normal flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Captured
        </Badge>
      );
    }
    if (agreement.paymentReady || agreement.status === "APPROVED") {
      return (
        <Badge variant="outline" className="text-blue-600 border-blue-500/30 bg-blue-500/10 font-normal flex items-center gap-1">
          <CreditCard className="h-3 w-3" />
          Ready
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-muted-foreground font-normal">
        Pending
      </Badge>
    );
  };

  const formatRelativeTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
      if (diffSec < 60) return "Just now";
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h ago`;
      return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block border border-border rounded-lg overflow-hidden bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[260px]">Product</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Agreed Price</TableHead>
              <TableHead>Total Value</TableHead>
              <TableHead>Agreement Status</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agreements.map((item, idx) => {
              const itemKey = item._id || item.id || `order_${idx}`;
              const product = (typeof item.productId === "object" ? item.productId : null) as PopulatedProduct | null;
              const productName = product?.name || "Product";
              const productSku = product?.sku;
              const productImg = product?.imageUrl;
              const buyerDisplay = "Buyer 1";
              const currency = item.currency || "INR";

              return (
                <TableRow key={itemKey} className="hover:bg-muted/40 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2.5">
                      {productImg ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={productImg}
                          alt={productName}
                          className="h-9 w-9 rounded-md object-cover border border-border shrink-0"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-md bg-muted/60 flex items-center justify-center border border-border shrink-0">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-sm text-foreground truncate max-w-[180px]" title={productName}>
                          {productName}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          {productSku && <span className="font-mono text-[11px]">{productSku}</span>}
                          <span className="flex items-center gap-0.5 text-primary">
                            <Bot className="h-3 w-3 shrink-0" />
                            <span className="text-[10px]">Negotiated</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {buyerDisplay}
                  </TableCell>

                  <TableCell className="text-sm font-medium">
                    {item.quantity} {item.quantity === 1 ? "unit" : "units"}
                  </TableCell>

                  <TableCell className="font-medium text-sm">
                    {formatCurrency(item.agreedUnitPrice, currency)}
                  </TableCell>

                  <TableCell className="font-bold text-sm text-foreground">
                    {formatCurrency(item.finalOrderValue, currency)}
                  </TableCell>

                  <TableCell>
                    {getAgreementStatusBadge(item.status)}
                  </TableCell>

                  <TableCell>
                    {getApprovalStatusBadge(item)}
                  </TableCell>

                  <TableCell>
                    {getPaymentStatusBadge(item)}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(item.updatedAt || item.createdAt)}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewDetail?.(item)}
                        className="h-8 px-2 text-xs"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View
                      </Button>
                      <Link href={`/merchant/orders/${item._id || item.id}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-xs"
                        >
                          Details
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {agreements.map((item, idx) => {
          const itemKey = item._id || item.id || `order_m_${idx}`;
          const product = (typeof item.productId === "object" ? item.productId : null) as PopulatedProduct | null;
          const productName = product?.name || "Product";
          const productImg = product?.imageUrl;
          const currency = item.currency || "INR";

          return (
            <Card key={itemKey} className="shadow-xs border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {productImg ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={productImg}
                        alt={productName}
                        className="h-10 w-10 rounded-md object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-muted/60 flex items-center justify-center border border-border shrink-0">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm text-foreground truncate">{productName}</h4>
                      <p className="text-xs text-muted-foreground">Buyer: Customer 1</p>
                    </div>
                  </div>
                  {getAgreementStatusBadge(item.status)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-border py-2.5">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Quantity</span>
                    <span className="font-medium">{item.quantity} {item.quantity === 1 ? "unit" : "units"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Agreed Price</span>
                    <span className="font-medium">{formatCurrency(item.agreedUnitPrice, currency)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Total Value</span>
                    <span className="font-bold text-foreground">{formatCurrency(item.finalOrderValue, currency)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Approval</span>
                    <span className="mt-0.5 block">{getApprovalStatusBadge(item)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Payment:</span>
                    {getPaymentStatusBadge(item)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewDetail?.(item)}
                      className="h-8 text-xs"
                    >
                      Quick View
                    </Button>
                    <Link href={`/merchant/orders/${item._id || item.id}`}>
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 text-xs"
                      >
                        Full Details
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
