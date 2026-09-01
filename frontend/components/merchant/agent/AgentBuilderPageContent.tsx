"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot, Save, RotateCcw, AlertCircle, RefreshCw, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AgentPreview } from "./AgentPreview";
import { AgentProductScopeSection } from "./AgentProductScopeSection";
import { fetchMerchantPolicy, updatePolicy, createPolicy } from "@/lib/api/policies";
import { updateMerchant } from "@/lib/api/merchants";
import { fetchProducts } from "@/lib/api/products";
import { useMerchant } from "@/hooks/useMerchant";
import type { Policy } from "@/types/policy";

export function AgentBuilderPageContent() {
  const { selectedMerchant, setSelectedMerchant, loading: merchantLoading } = useMerchant();

  const [serverPolicy, setServerPolicy] = useState<Policy | null>(null);
  const [formPolicy, setFormPolicy] = useState<Partial<Policy>>({});
  const [agentEnabled, setAgentEnabled] = useState<boolean>(true);
  const [agentDescription, setAgentDescription] = useState<string>("");

  const [productCount, setProductCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Load Policy and Merchant state
  const loadPolicyAndData = useCallback(async () => {
    if (!selectedMerchant?._id) return;
    try {
      setLoading(true);
      setError(null);
      setFieldErrors({});

      // Set merchant agent state
      setAgentEnabled(selectedMerchant.agentEnabled ?? true);
      setAgentDescription(selectedMerchant.agentDescription || "");

      // Load products count
      try {
        const prodRes = await fetchProducts({ merchantId: selectedMerchant._id, limit: 1 });
        if (prodRes.success && prodRes.pagination) {
          setProductCount(prodRes.pagination.total);
        } else if (prodRes.success && Array.isArray(prodRes.data)) {
          setProductCount(prodRes.data.length);
        }
      } catch (err) {
        console.warn("Product count fetch error:", err);
      }

      // Load policy
      const policyRes = await fetchMerchantPolicy(selectedMerchant._id);
      if (policyRes.success && policyRes.data) {
        setServerPolicy(policyRes.data);
        setFormPolicy(policyRes.data);
      } else {
        setServerPolicy(null);
        setFormPolicy({});
      }
    } catch (err: any) {
      console.error("Error loading policy:", err);
      if (err?.code === "POLICY_NOT_FOUND" || err?.status === 404) {
        setServerPolicy(null);
        setFormPolicy({});
      } else {
        setError("Unable to load agent configuration.");
      }
    } finally {
      setLoading(false);
    }
  }, [selectedMerchant]);

  useEffect(() => {
    if (!merchantLoading) {
      loadPolicyAndData();
    }
  }, [merchantLoading, loadPolicyAndData]);

  // Dirty state detection
  const isDirty = Boolean(
    serverPolicy === null && Object.keys(formPolicy).length > 0 ||
    (serverPolicy && (
      formPolicy.maxDiscountPercent !== serverPolicy.maxDiscountPercent ||
      formPolicy.minMarginPercent !== serverPolicy.minMarginPercent ||
      formPolicy.negotiationEnabled !== serverPolicy.negotiationEnabled ||
      formPolicy.maxNegotiationRounds !== serverPolicy.maxNegotiationRounds ||
      formPolicy.freeShippingThreshold !== serverPolicy.freeShippingThreshold ||
      formPolicy.maxQuantityPerOrder !== serverPolicy.maxQuantityPerOrder ||
      formPolicy.minOrderValue !== serverPolicy.minOrderValue ||
      formPolicy.maxOrderValue !== serverPolicy.maxOrderValue ||
      formPolicy.autoApprovalEnabled !== serverPolicy.autoApprovalEnabled ||
      formPolicy.autoApprovalLimit !== serverPolicy.autoApprovalLimit ||
      formPolicy.name !== serverPolicy.name ||
      formPolicy.isActive !== serverPolicy.isActive
    )) ||
    agentEnabled !== (selectedMerchant?.agentEnabled ?? true) ||
    agentDescription !== (selectedMerchant?.agentDescription || "")
  );

  // Field change handler
  const handlePolicyChange = (field: keyof Policy, value: any) => {
    setFormPolicy((prev) => ({ ...prev, [field]: value }));
    setSaveSuccess(false);
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
  };

  // Discard changes
  const handleDiscard = () => {
    if (serverPolicy) {
      setFormPolicy(serverPolicy);
    } else {
      setFormPolicy({});
    }
    if (selectedMerchant) {
      setAgentEnabled(selectedMerchant.agentEnabled ?? true);
      setAgentDescription(selectedMerchant.agentDescription || "");
    }
    setFieldErrors({});
    setSaveSuccess(false);
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    const maxDisc = Number(formPolicy.maxDiscountPercent ?? 10);
    if (isNaN(maxDisc) || maxDisc < 0 || maxDisc > 100) {
      errors.maxDiscountPercent = "Maximum discount must be between 0% and 100%";
    }

    const minMargin = Number(formPolicy.minMarginPercent ?? 20);
    if (isNaN(minMargin) || minMargin < 0 || minMargin > 100) {
      errors.minMarginPercent = "Minimum margin must be between 0% and 100%";
    }

    const maxRounds = Number(formPolicy.maxNegotiationRounds ?? 3);
    if (isNaN(maxRounds) || maxRounds < 0 || maxRounds > 20) {
      errors.maxNegotiationRounds = "Rounds must be an integer between 0 and 20";
    }

    const freeShip = Number(formPolicy.freeShippingThreshold ?? 5000);
    if (isNaN(freeShip) || freeShip < 0) {
      errors.freeShippingThreshold = "Free shipping threshold cannot be negative";
    }

    const maxQty = Number(formPolicy.maxQuantityPerOrder ?? 50);
    if (isNaN(maxQty) || maxQty < 1) {
      errors.maxQuantityPerOrder = "Max quantity must be at least 1";
    }

    const minOrder = Number(formPolicy.minOrderValue ?? 0);
    if (isNaN(minOrder) || minOrder < 0) {
      errors.minOrderValue = "Min order value cannot be negative";
    }

    const maxOrder = Number(formPolicy.maxOrderValue ?? 100000);
    if (isNaN(maxOrder) || maxOrder < minOrder) {
      errors.maxOrderValue = "Max order value cannot be less than min order value";
    }

    const autoLimit = Number(formPolicy.autoApprovalLimit ?? 50000);
    if (isNaN(autoLimit) || autoLimit < 0) {
      errors.autoApprovalLimit = "Auto approval limit cannot be negative";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save changes
  const handleSave = async () => {
    if (!selectedMerchant?._id) return;
    if (!validateForm()) return;

    try {
      setSaving(true);
      setError(null);

      // Update merchant agent properties if changed
      if (
        agentEnabled !== selectedMerchant.agentEnabled ||
        agentDescription !== selectedMerchant.agentDescription
      ) {
        const merchRes = await updateMerchant(selectedMerchant._id, {
          agentEnabled,
          agentDescription,
        });
        if (merchRes.success && merchRes.data) {
          setSelectedMerchant(merchRes.data);
        }
      }

      // Save policy
      let policyResult: Policy;

      if (serverPolicy?._id || serverPolicy?.id) {
        const policyId = (serverPolicy._id || serverPolicy.id) as string;
        const res = await updatePolicy(policyId, {
          name: formPolicy.name || "Default Commerce Policy",
          description: formPolicy.description,
          isActive: formPolicy.isActive ?? true,
          negotiationEnabled: formPolicy.negotiationEnabled ?? true,
          maxDiscountPercent: Number(formPolicy.maxDiscountPercent ?? 10),
          minMarginPercent: Number(formPolicy.minMarginPercent ?? 20),
          maxQuantityPerOrder: Number(formPolicy.maxQuantityPerOrder ?? 50),
          minOrderValue: Number(formPolicy.minOrderValue ?? 0),
          maxOrderValue: Number(formPolicy.maxOrderValue ?? 100000),
          autoApprovalEnabled: formPolicy.autoApprovalEnabled ?? true,
          autoApprovalLimit: Number(formPolicy.autoApprovalLimit ?? 50000),
          freeShippingThreshold: Number(formPolicy.freeShippingThreshold ?? 5000),
          maxNegotiationRounds: Number(formPolicy.maxNegotiationRounds ?? 3),
          allowedCurrencies: formPolicy.allowedCurrencies || ["INR"],
        });
        policyResult = res.data;
      } else {
        // Create policy
        const res = await createPolicy({
          merchantId: selectedMerchant._id,
          name: formPolicy.name || "Default Commerce Policy",
          description: formPolicy.description || "Rules for AI commerce negotiations",
          isActive: formPolicy.isActive ?? true,
          negotiationEnabled: formPolicy.negotiationEnabled ?? true,
          maxDiscountPercent: Number(formPolicy.maxDiscountPercent ?? 10),
          minMarginPercent: Number(formPolicy.minMarginPercent ?? 20),
          maxQuantityPerOrder: Number(formPolicy.maxQuantityPerOrder ?? 50),
          minOrderValue: Number(formPolicy.minOrderValue ?? 0),
          maxOrderValue: Number(formPolicy.maxOrderValue ?? 100000),
          autoApprovalEnabled: formPolicy.autoApprovalEnabled ?? true,
          autoApprovalLimit: Number(formPolicy.autoApprovalLimit ?? 50000),
          freeShippingThreshold: Number(formPolicy.freeShippingThreshold ?? 5000),
          maxNegotiationRounds: Number(formPolicy.maxNegotiationRounds ?? 3),
          allowedCurrencies: formPolicy.allowedCurrencies || ["INR"],
        });
        policyResult = res.data;
      }

      setServerPolicy(policyResult);
      setFormPolicy(policyResult);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error("Save policy failed:", err);
      setError(err?.message || "Unable to save agent configuration.");
    } finally {
      setSaving(false);
    }
  };

  // Initialize policy if none exists
  const handleCreateInitialPolicy = () => {
    setFormPolicy({
      name: "Default Commerce Policy",
      description: "Rules for AI commerce negotiations",
      isActive: true,
      negotiationEnabled: true,
      maxDiscountPercent: 10,
      minMarginPercent: 20,
      maxQuantityPerOrder: 50,
      minOrderValue: 0,
      maxOrderValue: 100000,
      autoApprovalEnabled: true,
      autoApprovalLimit: 50000,
      freeShippingThreshold: 5000,
      maxNegotiationRounds: 3,
      allowedCurrencies: ["INR"],
    });
  };

  if (loading || merchantLoading) {
    return (
      <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto w-full">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error && !formPolicy.name) {
    return (
      <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
        <div className="border border-border rounded-lg p-12 text-center bg-card space-y-4">
          <div className="inline-flex h-12 w-12 rounded-full bg-destructive/10 text-destructive items-center justify-center">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg text-foreground">Unable to load agent configuration.</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" onClick={loadPolicyAndData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const isAgentActive = agentEnabled && (formPolicy.negotiationEnabled ?? true);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Bot className="h-5 w-5" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Negotiation Agent
            </h1>
            {isAgentActive ? (
              <Badge variant="success" className="ml-2">
                ● Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="ml-2">
                ○ Disabled
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Your AI agent negotiates with buyers using your products and merchant-defined commerce rules.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {isDirty && (
            <Button variant="outline" size="sm" onClick={handleDiscard} disabled={saving}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Discard Changes
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!isDirty || saving}>
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {saveSuccess && (
        <div className="p-3 rounded-md bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 text-sm flex items-center gap-2 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Agent configuration saved successfully.</span>
        </div>
      )}

      {isDirty && !saveSuccess && (
        <div className="p-3 rounded-md bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200 text-xs flex items-center justify-between border border-amber-200 dark:border-amber-800">
          <span>You have unsaved changes. Click &quot;Save Changes&quot; to apply.</span>
          <span className="font-semibold text-[11px] uppercase tracking-wider">Unsaved</span>
        </div>
      )}

      {/* No Policy State Prompt */}
      {serverPolicy === null && !formPolicy.name && (
        <Card className="p-8 text-center border-border shadow-sm bg-card space-y-4">
          <div className="inline-flex h-12 w-12 rounded-full bg-primary/10 text-primary items-center justify-center">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="font-semibold text-lg text-foreground">No commerce policy configured</h3>
            <p className="text-sm text-muted-foreground">
              Create a policy to control how your Negotiation Agent handles pricing, shipping, orders, and approvals.
            </p>
          </div>
          <Button onClick={handleCreateInitialPolicy}>Create Policy</Button>
        </Card>
      )}

      {(serverPolicy !== null || formPolicy.name) && (
        <Tabs defaultValue="pricing" className="space-y-6">
          <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full h-auto">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="negotiation">Rules</TabsTrigger>
            <TabsTrigger value="shipping">Shipping</TabsTrigger>
            <TabsTrigger value="limits">Order Limits</TabsTrigger>
            <TabsTrigger value="approval">Approval</TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="space-y-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">General Settings</CardTitle>
                <CardDescription className="text-xs">
                  Basic agent status and description.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-md border border-border bg-card">
                  <div>
                    <span className="font-medium text-sm text-foreground block">Agent Status</span>
                    <span className="text-xs text-muted-foreground">Enable or disable your AI negotiation agent.</span>
                  </div>
                  <Switch
                    checked={agentEnabled}
                    onCheckedChange={setAgentEnabled}
                    aria-label="Toggle agent status"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="agentDesc" className="text-xs font-medium text-foreground">
                    Agent Description
                  </label>
                  <Input
                    id="agentDesc"
                    value={agentDescription}
                    onChange={(e) => setAgentDescription(e.target.value)}
                    placeholder="AI agent that negotiates with buyers using catalog pricing..."
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Optional description displayed in merchant portal.
                  </p>
                </div>
              </CardContent>
            </Card>

            <AgentProductScopeSection productCount={productCount} />
          </TabsContent>

          {/* Pricing & Discounts Tab */}
          <TabsContent value="pricing" className="space-y-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pricing & Discounts</CardTitle>
                <CardDescription className="text-xs">
                  Set safety limits for discount percentage and minimum profit margin.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="maxDiscount" className="text-xs font-medium text-foreground">
                    Maximum Discount (%)
                  </label>
                  <Input
                    id="maxDiscount"
                    type="number"
                    min={0}
                    max={100}
                    value={formPolicy.maxDiscountPercent ?? 10}
                    onChange={(e) => handlePolicyChange("maxDiscountPercent", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Maximum percentage discount your agent may offer.
                  </p>
                  {fieldErrors.maxDiscountPercent && (
                    <span className="text-xs text-destructive">{fieldErrors.maxDiscountPercent}</span>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="minMargin" className="text-xs font-medium text-foreground">
                    Minimum Profit Margin (%)
                  </label>
                  <Input
                    id="minMargin"
                    type="number"
                    min={0}
                    max={100}
                    value={formPolicy.minMarginPercent ?? 20}
                    onChange={(e) => handlePolicyChange("minMarginPercent", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Minimum margin the merchant requires after discounts.
                  </p>
                  {fieldErrors.minMarginPercent && (
                    <span className="text-xs text-destructive">{fieldErrors.minMarginPercent}</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <AgentPreview policy={formPolicy} agentEnabled={agentEnabled} />
          </TabsContent>

          {/* Negotiation Rules Tab */}
          <TabsContent value="negotiation" className="space-y-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Negotiation Rules</CardTitle>
                <CardDescription className="text-xs">
                  Configure negotiation enablement and round limits.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-md border border-border bg-card">
                  <div>
                    <span className="font-medium text-sm text-foreground block">Negotiation Enabled</span>
                    <span className="text-xs text-muted-foreground">Allow buyers to negotiate prices on eligible products.</span>
                  </div>
                  <Switch
                    checked={formPolicy.negotiationEnabled ?? true}
                    onCheckedChange={(val) => handlePolicyChange("negotiationEnabled", val)}
                    aria-label="Toggle negotiation enablement"
                  />
                </div>

                <div className="space-y-2 max-w-sm">
                  <label htmlFor="maxRounds" className="text-xs font-medium text-foreground">
                    Maximum Negotiation Rounds
                  </label>
                  <Input
                    id="maxRounds"
                    type="number"
                    min={0}
                    max={20}
                    value={formPolicy.maxNegotiationRounds ?? 3}
                    onChange={(e) => handlePolicyChange("maxNegotiationRounds", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Maximum number of negotiation rounds allowed per buyer request.
                  </p>
                  {fieldErrors.maxNegotiationRounds && (
                    <span className="text-xs text-destructive">{fieldErrors.maxNegotiationRounds}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Shipping Tab */}
          <TabsContent value="shipping" className="space-y-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Shipping Policy</CardTitle>
                <CardDescription className="text-xs">
                  Set threshold for free delivery eligibility.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 max-w-sm">
                <div className="space-y-2">
                  <label htmlFor="freeShipping" className="text-xs font-medium text-foreground">
                    Free Shipping Threshold (₹)
                  </label>
                  <Input
                    id="freeShipping"
                    type="number"
                    min={0}
                    value={formPolicy.freeShippingThreshold ?? 5000}
                    onChange={(e) => handlePolicyChange("freeShippingThreshold", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Orders at or above this value qualify for free shipping.
                  </p>
                  {fieldErrors.freeShippingThreshold && (
                    <span className="text-xs text-destructive">{fieldErrors.freeShippingThreshold}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Order Limits Tab */}
          <TabsContent value="limits" className="space-y-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Order Limits</CardTitle>
                <CardDescription className="text-xs">
                  Control order quantities and value bounds.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label htmlFor="maxQty" className="text-xs font-medium text-foreground">
                    Max Quantity Per Order
                  </label>
                  <Input
                    id="maxQty"
                    type="number"
                    min={1}
                    value={formPolicy.maxQuantityPerOrder ?? 50}
                    onChange={(e) => handlePolicyChange("maxQuantityPerOrder", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground">Maximum units per order.</p>
                  {fieldErrors.maxQuantityPerOrder && (
                    <span className="text-xs text-destructive">{fieldErrors.maxQuantityPerOrder}</span>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="minVal" className="text-xs font-medium text-foreground">
                    Minimum Order Value (₹)
                  </label>
                  <Input
                    id="minVal"
                    type="number"
                    min={0}
                    value={formPolicy.minOrderValue ?? 0}
                    onChange={(e) => handlePolicyChange("minOrderValue", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground">Minimum total order value required.</p>
                  {fieldErrors.minOrderValue && (
                    <span className="text-xs text-destructive">{fieldErrors.minOrderValue}</span>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="maxVal" className="text-xs font-medium text-foreground">
                    Maximum Order Value (₹)
                  </label>
                  <Input
                    id="maxVal"
                    type="number"
                    min={0}
                    value={formPolicy.maxOrderValue ?? 100000}
                    onChange={(e) => handlePolicyChange("maxOrderValue", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground">Maximum total order value allowed.</p>
                  {fieldErrors.maxOrderValue && (
                    <span className="text-xs text-destructive">{fieldErrors.maxOrderValue}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Approval Rules Tab */}
          <TabsContent value="approval" className="space-y-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Approval Rules</CardTitle>
                <CardDescription className="text-xs">
                  Configure automatic agreement approval thresholds.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-md border border-border bg-card">
                  <div>
                    <span className="font-medium text-sm text-foreground block">Auto Approval</span>
                    <span className="text-xs text-muted-foreground">Automatically approve agreements within the limit.</span>
                  </div>
                  <Switch
                    checked={formPolicy.autoApprovalEnabled ?? true}
                    onCheckedChange={(val) => handlePolicyChange("autoApprovalEnabled", val)}
                    aria-label="Toggle auto approval"
                  />
                </div>

                <div className="space-y-2 max-w-sm">
                  <label htmlFor="autoLimit" className="text-xs font-medium text-foreground">
                    Auto Approval Limit (₹)
                  </label>
                  <Input
                    id="autoLimit"
                    type="number"
                    min={0}
                    value={formPolicy.autoApprovalLimit ?? 50000}
                    onChange={(e) => handlePolicyChange("autoApprovalLimit", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Orders up to this amount are approved automatically.
                  </p>
                  {fieldErrors.autoApprovalLimit && (
                    <span className="text-xs text-destructive">{fieldErrors.autoApprovalLimit}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
