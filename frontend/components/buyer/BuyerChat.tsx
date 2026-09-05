"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  User,
  Send,
  Sparkles,
  RefreshCw,
  Plus,
  AlertCircle,
  CreditCard,
  ArrowRight,
  ExternalLink,
  ArrowLeft,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { ProductCard } from "./ProductCard";
import { ProductDetailDialog } from "./ProductDetailDialog";
import { ChatActions } from "./ChatActions";
import { MarkdownMessage } from "./MarkdownMessage";
import { sendBuyerMessage } from "@/lib/api/buyer";
import {
  createPaymentOrder,
  verifyPayment,
  loadRazorpayScript,
} from "@/lib/api/payments";
import type { RazorpayCheckoutOptions } from "@/types/payment";
import { formatCurrency } from "@/lib/utils/format";
import type {
  BuyerChatMessage,
  BuyerProduct,
  BuyerChatAction,
} from "@/types/buyer";

export interface BuyerChatProps {
  headerTitle?: string;
  subtitle?: string;
  backLink?: { href: string; label: string };
  embedded?: boolean;
}

export function BuyerChat({
  headerTitle = "Buyer Agent",
  subtitle,
  backLink,
  embedded = false,
}: BuyerChatProps) {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [messages, setMessages] = useState<BuyerChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<BuyerProduct | null>(null);

  // Message sequence counter to avoid impure calls
  const msgSeqRef = useRef<number>(0);

  // Detail Modal state
  const [detailProduct, setDetailProduct] = useState<BuyerProduct | null>(null);
  const [detailOpen, setDetailOpen] = useState<boolean>(false);

  // Active Action processing state
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  // Pay Now placeholder modal
  const [payNowModalOpen, setPayNowModalOpen] = useState<boolean>(false);

  // Auto-scroll ref
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  // Starter prompts
  const starterPrompts = [
    "Find me an ergonomic chair",
    "Show me laptops under ₹80,000",
    "Find running shoes",
    "Find products for my home office",
  ];

  // Send message to Buyer Agent
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading) return;

    setError(null);
    setInputText("");

    msgSeqRef.current += 1;
    const userMsgId = `user_${msgSeqRef.current}`;
    const userTimestamp = new Date().toISOString();
    const userMessage: BuyerChatMessage = {
      id: userMsgId,
      role: "user",
      content: text,
      createdAt: userTimestamp,
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const res = await sendBuyerMessage({
        conversationId: conversationId || undefined,
        message: text,
      });

      if (res.success && res.data) {
        const data = res.data;
        setConversationId(data.conversationId);

        if (data.selectedProduct) {
          setSelectedProduct(data.selectedProduct);
        }

        msgSeqRef.current += 1;
        const assistantMsgId = `assistant_${msgSeqRef.current}`;
        const assistantTimestamp = new Date().toISOString();
        const assistantMessage: BuyerChatMessage = {
          id: assistantMsgId,
          role: "assistant",
          content: data.message,
          createdAt: assistantTimestamp,
          products: data.products || [],
          selectedProduct: data.selectedProduct,
          actions: data.actions || [],
          searchState: data.searchState,
          paymentReady: data.paymentReady,
          agreement: data.agreement,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error("Invalid response from assistant");
      }
    } catch (err: unknown) {
      console.error("Buyer Agent error:", err);
      setError("Something went wrong. Please try again.");
      setInputText(text);
    } finally {
      setLoading(false);
    }
  };

  // Handle action button clicks (ACCEPT_NEGOTIATION, CONTINUE_NEGOTIATION, PLACE_ORDER, PAY_NOW, etc.)
  const handleActionClick = async (action: BuyerChatAction) => {
    if (loading || activeActionId !== null) return;

    if (action.type === "PAY_NOW") {
      const latestAgreementMsg = [...messages].reverse().find((m) => m.agreement?.id);
      const agId = action.agreementId || latestAgreementMsg?.agreement?.id;
      if (agId) {
        await handlePayNow(agId, action.id);
        return;
      }
    }

    const actionKey = action.id || action.type;
    setActiveActionId(actionKey);
    setError(null);

    try {
      const res = await sendBuyerMessage({
        conversationId: conversationId || undefined,
        action: {
          type: action.type,
          negotiationId: action.negotiationId,
          agreementId: action.agreementId,
          productId: action.productId,
        },
      });

      if (res.success && res.data) {
        const data = res.data;
        setConversationId(data.conversationId);

        if (data.selectedProduct) {
          setSelectedProduct(data.selectedProduct);
        }

        msgSeqRef.current += 1;
        const assistantMsgId = `assistant_action_${msgSeqRef.current}`;
        const assistantTimestamp = new Date().toISOString();
        const assistantMessage: BuyerChatMessage = {
          id: assistantMsgId,
          role: "assistant",
          content: data.message,
          createdAt: assistantTimestamp,
          products: data.products || [],
          selectedProduct: data.selectedProduct,
          actions: data.actions || [],
          searchState: data.searchState,
          paymentReady: data.paymentReady,
          agreement: data.agreement,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error("Action failed to execute");
      }
    } catch (err: unknown) {
      console.error("Action error:", err);
      setError("Failed to execute action. Please try again.");
    } finally {
      setActiveActionId(null);
    }
  };

  // Launch Razorpay Standard Web Checkout
  const handlePayNow = async (agreementId: string, actionId?: string) => {
    if (!agreementId) {
      setError("Agreement ID is missing for payment.");
      return;
    }

    const actionKey = actionId || "PAY_NOW";
    setActiveActionId(actionKey);
    setError(null);

    try {
      const isScriptLoaded = await loadRazorpayScript();
      if (!isScriptLoaded) {
        throw new Error("Unable to load Razorpay payment SDK. Check network connection.");
      }

      const orderRes = await createPaymentOrder(agreementId);
      if (!orderRes.success || !orderRes.data) {
        throw new Error(orderRes.error || orderRes.message || "Failed to create payment order");
      }

      const { keyId, orderId, amount, currency } = orderRes.data;

      const options: RazorpayCheckoutOptions = {
        key: keyId,
        amount,
        currency,
        name: "AI Commerce Store",
        description: `Order Payment #${agreementId.slice(-6)}`,
        order_id: orderId,
        handler: async (response) => {
          try {
            setActiveActionId("VERIFYING_PAYMENT");
            const verifyRes = await verifyPayment({
              agreementId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpaySignature: response.razorpay_signature,
            });

            if (verifyRes.success && verifyRes.data?.status === "CAPTURED") {
              const updatedProductData = verifyRes.data.product;

              if (updatedProductData) {
                // Update selectedProduct inventory in local state
                setSelectedProduct((prev) => {
                  if (!prev) return prev;
                  if (prev.id === updatedProductData.id || prev._id === updatedProductData.id) {
                    return {
                      ...prev,
                      inventory: updatedProductData.inventory,
                    };
                  }
                  return prev;
                });

                // Update any product cards in previous messages
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (!msg.products || msg.products.length === 0) return msg;
                    const hasTargetProduct = msg.products.some(
                      (p) => p.id === updatedProductData.id || p._id === updatedProductData.id
                    );
                    if (!hasTargetProduct) return msg;
                    return {
                      ...msg,
                      products: msg.products.map((p) =>
                        p.id === updatedProductData.id || p._id === updatedProductData.id
                          ? { ...p, inventory: updatedProductData.inventory }
                          : p
                      ),
                    };
                  })
                );
              }

              msgSeqRef.current += 1;
              const successMsg: BuyerChatMessage = {
                id: `assistant_payment_${msgSeqRef.current}`,
                role: "assistant",
                content: `🎉 **Payment Successful!**\n\n- **Payment ID**: \`${response.razorpay_payment_id}\`\n- **Order ID**: \`${response.razorpay_order_id}\`\n\nYour order has been verified and captured. Thank you for your purchase!`,
                createdAt: new Date().toISOString(),
                paymentReady: false,
                actions: [],
              };
              setMessages((prev) => [...prev, successMsg]);
            } else {
              throw new Error(verifyRes.error || "Payment signature verification failed.");
            }
          } catch (verifyErr: any) {
            console.error("Verification error:", verifyErr);
            setError(verifyErr?.message || "Payment verification failed. Please contact support.");
          } finally {
            setActiveActionId(null);
          }
        },
        modal: {
          ondismiss: () => {
            console.log("[PAYMENT] Razorpay Checkout modal dismissed by buyer.");
            setActiveActionId(null);
          },
        },
        theme: {
          color: "#2563eb",
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", (resp: any) => {
        console.error("[PAYMENT] Payment failed:", resp.error);
        setError(`Payment failed: ${resp.error?.description || "Transaction declined"}`);
        setActiveActionId(null);
      });

      rzp.open();
    } catch (err: any) {
      console.error("[PAYMENT] Error launching Razorpay Checkout:", err);
      setError(err?.message || "Failed to initiate payment. Please try again.");
      setActiveActionId(null);
    }
  };

  // Select Product handler
  const handleSelectProduct = (product: BuyerProduct) => {
    setSelectedProduct(product);
    handleSendMessage(`I would like to select the ${product.name}`);
  };

  // View Product Details handler
  const handleViewProduct = (product: BuyerProduct) => {
    setDetailProduct(product);
    setDetailOpen(true);
  };

  // Start a new chat session
  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setSelectedProduct(null);
    setError(null);
    setInputText("");
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Keyboard shortcut: Enter to send, Shift+Enter for newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const containerClasses = embedded
    ? "flex flex-col h-[calc(100vh-5rem)] max-h-full bg-background text-foreground border border-border rounded-xl overflow-hidden shadow-xs"
    : "flex flex-col h-screen max-h-screen bg-background text-foreground";

  return (
    <div className={containerClasses}>
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card/80 backdrop-blur-sm px-4 py-3 sm:px-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          {backLink && (
            <Link href={backLink.href}>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">{backLink.label}</span>
              </Button>
            </Link>
          )}
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base sm:text-lg text-foreground leading-tight">
                {headerTitle}
              </h1>
              <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30 bg-emerald-500/10 font-normal">
                Online
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {subtitle ? (
                subtitle
              ) : conversationId ? (
                <span className="font-mono text-[11px]">Session: {conversationId.slice(0, 16)}...</span>
              ) : (
                "AI shopping assistant • Powered by Agentic Commerce"
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {conversationId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNewChat}
              className="text-xs h-8"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              New Chat
            </Button>
          )}

          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground hidden md:inline">
                {user.name}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await logout();
                  router.push("/buyer/login");
                }}
                className="text-xs h-8 text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-3.5 w-3.5 mr-1" />
                Logout
              </Button>
            </div>
          ) : (
            <Link href="/buyer/login">
              <Button variant="outline" size="sm" className="text-xs h-8">
                Sign In
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Selected Product Banner (Context Sticky Header) */}
      {selectedProduct && (
        <div className="shrink-0 bg-muted/40 border-b border-border px-4 py-2 sm:px-6 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground shrink-0">Selected Product:</span>
            <span className="font-semibold text-foreground truncate">{selectedProduct.name}</span>
            <Badge variant="secondary" className="font-normal text-[11px] shrink-0">
              {formatCurrency(selectedProduct.price, "INR")}
            </Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleViewProduct(selectedProduct)}
            className="h-6 px-2 text-[11px] text-primary"
          >
            View Details
          </Button>
        </div>
      )}

      {/* Chat Messages Container */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-4xl mx-auto w-full">
        {messages.length === 0 ? (
          /* Empty Chat Welcome State */
          <div className="h-full min-h-[50vh] flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shadow-xs">
              <Sparkles className="h-8 w-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                How can I help you shop today?
              </h2>
              <p className="text-sm text-muted-foreground">
                Search our catalog, explore specifications, and negotiate the best commercial price in real-time.
              </p>
            </div>

            <div className="w-full space-y-2 pt-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Suggested Requests
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {starterPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(prompt)}
                    className="p-3 rounded-lg border border-border bg-card hover:bg-muted/60 text-left text-xs font-medium text-foreground transition-colors flex items-center justify-between group shadow-2xs"
                  >
                    <span>{prompt}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Message Thread */
          <div className="space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
              >
                {/* Assistant Avatar */}
                {msg.role === "assistant" && (
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 mt-1">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                {/* Message Content & Product Attachments */}
                <div
                  className={`space-y-3 max-w-[85%] sm:max-w-[78%] ${msg.role === "user" ? "items-end text-right" : "items-start text-left"
                    }`}
                >
                  {/* Bubble */}
                  <div
                    className={`p-4 rounded-2xl text-sm leading-relaxed ${msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-xs"
                        : "bg-card border border-border text-foreground rounded-tl-xs shadow-xs"
                      }`}
                  >
                    {msg.role === "assistant" ? (
                      <MarkdownMessage content={msg.content} className="space-y-2" />
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>

                  {/* Inline Product Cards */}
                  {msg.products && msg.products.length > 0 && (
                    <div className="w-full pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {msg.products.map((prod) => (
                          <ProductCard
                            key={prod.id || prod._id}
                            product={prod}
                            onView={handleViewProduct}
                            onSelect={handleSelectProduct}
                            isSelected={selectedProduct?.id === prod.id || selectedProduct?._id === prod._id}
                            disabled={loading}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dynamic Action Buttons */}
                  {msg.actions && msg.actions.length > 0 && (
                    <ChatActions
                      actions={msg.actions}
                      onActionClick={handleActionClick}
                      disabled={loading}
                      activeActionId={activeActionId}
                    />
                  )}
                </div>

                {/* User Avatar */}
                {msg.role === "user" && (
                  <div className="h-8 w-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0 border border-border mt-1">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {/* Thinking / Typing Indicator */}
            {loading && (
              <div className="flex gap-3 items-start">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 mt-1 animate-pulse">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="p-4 rounded-2xl rounded-tl-xs bg-card border border-border text-muted-foreground text-xs flex items-center gap-2 shadow-xs">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>Agent is thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input Area */}
      <footer className="shrink-0 border-t border-border bg-card p-3 sm:p-4 z-10">
        <div className="max-w-4xl mx-auto space-y-2">
          {error && (
            <div className="p-2.5 rounded-md bg-destructive/10 text-destructive text-xs flex items-center justify-between border border-destructive/20">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSendMessage()}
                className="h-6 px-2 text-xs hover:bg-destructive/20"
              >
                Retry
              </Button>
            </div>
          )}

          <div className="relative flex items-end gap-2 bg-background border border-input rounded-xl p-1.5 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-all shadow-2xs">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to find a product, compare options, or negotiate a price..."
              rows={1}
              className="flex-1 max-h-32 min-h-[40px] resize-none bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading}
            />

            <Button
              type="button"
              size="icon"
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim() || loading}
              className="h-9 w-9 shrink-0 rounded-lg"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[11px] text-center text-muted-foreground">
            Press <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Enter</kbd> to send, <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Shift + Enter</kbd> for newline
          </p>
        </div>
      </footer>

      {/* Product Detail Modal */}
      <ProductDetailDialog
        product={detailProduct}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onSelect={handleSelectProduct}
        isSelected={selectedProduct?.id === detailProduct?.id || selectedProduct?._id === detailProduct?._id}
      />

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
                Your negotiated agreement is approved and ready for payment.
              </p>
              <p className="text-xs text-primary font-medium pt-1">
                Razorpay Checkout will be connected here.
              </p>
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setPayNowModalOpen(false)}
              className="w-full"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
