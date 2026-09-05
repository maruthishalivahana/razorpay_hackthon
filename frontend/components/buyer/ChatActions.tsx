"use client";

import {
  Check,
  RefreshCw,
  ShoppingBag,
  CreditCard,
  Eye,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BuyerChatAction } from "@/types/buyer";

interface ChatActionsProps {
  actions: BuyerChatAction[];
  onActionClick: (action: BuyerChatAction) => void;
  disabled?: boolean;
  activeActionId?: string | null;
}

export function ChatActions({
  actions,
  onActionClick,
  disabled = false,
  activeActionId = null,
}: ChatActionsProps) {
  if (!actions || actions.length === 0) {
    return null;
  }

  const getActionIcon = (type: string) => {
    switch (type) {
      case "ACCEPT_NEGOTIATION":
        return <Check className="h-3.5 w-3.5 mr-1 text-emerald-500" />;
      case "CONTINUE_NEGOTIATION":
        return <MessageSquare className="h-3.5 w-3.5 mr-1" />;
      case "PLACE_ORDER":
        return <ShoppingBag className="h-3.5 w-3.5 mr-1" />;
      case "PAY_NOW":
        return <CreditCard className="h-3.5 w-3.5 mr-1" />;
      case "VIEW_PRODUCT":
      case "VIEW_DETAILS":
      case "VIEW_ORDER_STATUS":
        return <Eye className="h-3.5 w-3.5 mr-1" />;
      case "MAKE_OFFER":
        return <Sparkles className="h-3.5 w-3.5 mr-1 text-primary" />;
      default:
        return null;
    }
  };

  const getActionVariant = (type: string): "default" | "outline" | "secondary" => {
    switch (type) {
      case "ACCEPT_NEGOTIATION":
      case "PLACE_ORDER":
      case "PAY_NOW":
        return "default";
      case "CONTINUE_NEGOTIATION":
      case "VIEW_ORDER_STATUS":
      case "VIEW_PRODUCT":
      case "VIEW_DETAILS":
        return "outline";
      default:
        return "secondary";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      {actions.map((action, idx) => {
        const isCurrentLoading = activeActionId === (action.id || `act_${idx}`);
        const isButtonDisabled = disabled || action.disabled || (activeActionId !== null && !isCurrentLoading);
        const variant = getActionVariant(action.type);

        return (
          <Button
            key={action.id || `action_${idx}`}
            type="button"
            variant={variant}
            size="sm"
            onClick={() => onActionClick(action)}
            disabled={isButtonDisabled}
            className={`text-xs h-8 font-medium transition-all ${
              action.type === "ACCEPT_NEGOTIATION"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                : action.type === "PAY_NOW"
                ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                : ""
            }`}
          >
            {isCurrentLoading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {getActionIcon(action.type)}
                {action.label}
              </>
            )}
          </Button>
        );
      })}
    </div>
  );
}
