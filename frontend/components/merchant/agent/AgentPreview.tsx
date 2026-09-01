import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Percent, Truck, RotateCcw, ShieldCheck } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import type { Policy } from "@/types/policy";

interface AgentPreviewProps {
  policy: Partial<Policy>;
  agentEnabled?: boolean;
}

export function AgentPreview({ policy, agentEnabled }: AgentPreviewProps) {
  const maxDiscount = policy.maxDiscountPercent ?? 10;
  const freeShipping = policy.freeShippingThreshold ?? 5000;
  const maxRounds = policy.maxNegotiationRounds ?? 3;
  const autoApprovalLimit = policy.autoApprovalLimit ?? 50000;
  const negotiationEnabled = policy.negotiationEnabled ?? true;

  return (
    <Card className="border-border shadow-sm bg-muted/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-semibold">Agent Behavior Preview</CardTitle>
          </div>
          {agentEnabled && negotiationEnabled ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="secondary">Disabled</Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          Your AI agent will negotiate with buyers using your configured commerce rules.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="flex items-start gap-2.5 p-2.5 rounded-md bg-card border border-border">
            <Percent className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-foreground block">Max Discount</span>
              <span className="text-muted-foreground">Up to {maxDiscount}% off list price</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-md bg-card border border-border">
            <Truck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-foreground block">Free Delivery</span>
              <span className="text-muted-foreground">Orders from {formatCurrency(freeShipping)}</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-md bg-card border border-border">
            <RotateCcw className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-foreground block">Negotiation Limit</span>
              <span className="text-muted-foreground">
                {negotiationEnabled ? `Max ${maxRounds} rounds` : "Negotiation disabled"}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-md bg-card border border-border">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-foreground block">Auto-Approval</span>
              <span className="text-muted-foreground">Up to {formatCurrency(autoApprovalLimit)}</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground italic pt-1">
          &quot;Offers up to {maxDiscount}% discount, includes free delivery on orders above {formatCurrency(freeShipping)}, and permits up to {maxRounds} negotiation rounds.&quot;
        </p>
      </CardContent>
    </Card>
  );
}
