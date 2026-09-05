"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Save, RotateCcw, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AgentPreview } from "./AgentPreview";
import { AgentProductScopeSection } from "./AgentProductScopeSection";
import { fetchMyPolicy, updatePolicy, createPolicy } from "@/lib/api/policies";
import { updateMerchant } from "@/lib/api/merchants";
import { fetchProducts } from "@/lib/api/products";
import { useMerchant } from "@/hooks/useMerchant";
import type { Policy } from "@/types/policy";

type Mode = "CREATE" | "EDIT";

export function AgentBuilderPageContent() {
  const { selectedMerchant, setSelectedMerchant, loading: merchantLoading } = useMerchant();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("CREATE");
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [serverPolicy, setServerPolicy] = useState<Policy | null>(null);
  const [formPolicy, setFormPolicy] = useState<Partial<Policy>>({});
  const [agentEnabled, setAgentEnabled] = useState<boolean>(false);
  const [agentDescription, setAgentDescription] = useState<string>("");

  const [productCount, setProductCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Load Policy and Merchant state
  const loadPolicyAndData = useCallback(async () => {
    if (!selectedMerchant?._id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setFieldErrors({});

      // Set merchant agent state
      setAgentEnabled(selectedMerchant.agentEnabled ?? false);
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
      try {
        const policyRes = await fetchMyPolicy();
        if (policyRes.success && policyRes.data) {
          setServerPolicy(policyRes.data);
          setPolicyId(policyRes.data._id || policyRes.data.id || null);
          setMode("EDIT");
          setFormPolicy(policyRes.data);
        } else {
          setPolicyId(null);
          setMode("CREATE");
          setServerPolicy(null);
          setFormPolicy({});
        }
      } catch (err: unknown) {
        const e = err as { status?: number; code?: string; message?: string };
        const isNotFound =
          e?.status === 404 ||
          e?.code === "NOT_FOUND" ||
          e?.code === "POLICY_NOT_FOUND" ||
          e?.code === "HTTP_404" ||
          (e?.message && String(e.message).toLowerCase().includes("not found"));

        if (isNotFound) {
          // Clean 404 / Policy does not exist -> First-run CREATE mode
          setPolicyId(null);
          setMode("CREATE");
          setServerPolicy(null);
          setFormPolicy({});
          setError(null);
        } else {
          // Genuine 500 or network error
          console.error("Genuine server error loading policy:", err);
          setError("Unable to load agent configuration.");
        }
      }
    } catch (err: unknown) {
      console.error("Error loading policy and data:", err);
      setError("Unable to load agent configuration.");
    } finally {
      setLoading(false);
    }
  }, [selectedMerchant]);

  useEffect(() => {
    if (!merchantLoading && selectedMerchant?._id) {
      const timer = setTimeout(() => {
        void loadPolicyAndData();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [merchantLoading, selectedMerchant?._id, loadPolicyAndData]);

  // Dirty state detection
  const isDirty = Boolean(
    (serverPolicy === null && Object.keys(formPolicy).length > 0) ||
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
    agentEnabled !== (selectedMerchant?.agentEnabled ?? false) ||
    agentDescription !== (selectedMerchant?.agentDescription || "")
  );

  // Field change handler
  const handlePolicyChange = (field: keyof Policy, value: unknown) => {
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

  // Helper to get field value for input display
  const getFieldValue = (field: keyof Policy, fallbackDefault?: number): string | number => {
    if (formPolicy[field] !== undefined && formPolicy[field] !== null) {
      return formPolicy[field] as number;
    }
    if (mode === "EDIT" && fallbackDefault !== undefined) {
      return fallbackDefault;
    }
    return "";
  };

  // Discard changes
  const handleDiscard = () => {
    if (serverPolicy) {
      setFormPolicy(serverPolicy);
    } else {
      setFormPolicy({});
    }
    if (selectedMerchant) {
      setAgentEnabled(selectedMerchant.agentEnabled ?? false);
      setAgentDescription(selectedMerchant.agentDescription || "");
    }
    setFieldErrors({});
    setSaveSuccess(false);
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (formPolicy.maxDiscountPercent !== undefined && formPolicy.maxDiscountPercent !== null && String(formPolicy.maxDiscountPercent) !== "") {
      const maxDisc = Number(formPolicy.maxDiscountPercent);
      if (isNaN(maxDisc) || maxDisc < 0 || maxDisc > 100) {
        errors.maxDiscountPercent = "Maximum discount must be between 0% and 100%";
      }
    }

    if (formPolicy.minMarginPercent !== undefined && formPolicy.minMarginPercent !== null && String(formPolicy.minMarginPercent) !== "") {
      const minMargin = Number(formPolicy.minMarginPercent);
      if (isNaN(minMargin) || minMargin < 0 || minMargin > 100) {
        errors.minMarginPercent = "Minimum margin must be between 0% and 100%";
      }
    }

    if (formPolicy.maxNegotiationRounds !== undefined && formPolicy.maxNegotiationRounds !== null && String(formPolicy.maxNegotiationRounds) !== "") {
      const maxRounds = Number(formPolicy.maxNegotiationRounds);
      if (isNaN(maxRounds) || maxRounds < 0 || maxRounds > 20) {
        errors.maxNegotiationRounds = "Rounds must be an integer between 0 and 20";
      }
    }

    if (formPolicy.freeShippingThreshold !== undefined && formPolicy.freeShippingThreshold !== null && String(formPolicy.freeShippingThreshold) !== "") {
      const freeShip = Number(formPolicy.freeShippingThreshold);
      if (isNaN(freeShip) || freeShip < 0) {
        errors.freeShippingThreshold = "Free shipping threshold cannot be negative";
      }
    }

    if (formPolicy.maxQuantityPerOrder !== undefined && formPolicy.maxQuantityPerOrder !== null && String(formPolicy.maxQuantityPerOrder) !== "") {
      const maxQty = Number(formPolicy.maxQuantityPerOrder);
      if (isNaN(maxQty) || maxQty < 1) {
        errors.maxQuantityPerOrder = "Max quantity must be at least 1";
      }
    }

    if (formPolicy.minOrderValue !== undefined && formPolicy.minOrderValue !== null && String(formPolicy.minOrderValue) !== "") {
      const minOrder = Number(formPolicy.minOrderValue);
      if (isNaN(minOrder) || minOrder < 0) {
        errors.minOrderValue = "Min order value cannot be negative";
      }
    }

    const minOrderVal = Number(
      formPolicy.minOrderValue ?? (mode === "EDIT" ? serverPolicy?.minOrderValue : 0) ?? 0
    );
    const maxOrderVal = Number(
      formPolicy.maxOrderValue ?? (mode === "EDIT" ? serverPolicy?.maxOrderValue : 100000) ?? 100000
    );
    if (formPolicy.maxOrderValue !== undefined && formPolicy.maxOrderValue !== null && String(formPolicy.maxOrderValue) !== "") {
      if (isNaN(maxOrderVal) || maxOrderVal < minOrderVal) {
        errors.maxOrderValue = "Max order value cannot be less than min order value";
      }
    }

    const autoApprovalVal = Number(
      formPolicy.autoApprovalLimit ?? (mode === "EDIT" ? serverPolicy?.autoApprovalLimit : 50000) ?? 50000
    );
    if (formPolicy.autoApprovalLimit !== undefined && formPolicy.autoApprovalLimit !== null && String(formPolicy.autoApprovalLimit) !== "") {
      if (isNaN(autoApprovalVal) || autoApprovalVal < 0) {
        errors.autoApprovalLimit = "Auto approval limit cannot be negative";
      }
    }

    if (
      !isNaN(autoApprovalVal) &&
      !isNaN(maxOrderVal) &&
      autoApprovalVal > maxOrderVal
    ) {
      errors.autoApprovalLimit = "Auto approval limit cannot be greater than max order value";
      errors.maxOrderValue = "Max order value must be at least the auto approval limit";
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
      if (mode === "EDIT") {
        if (!policyId) {
          throw new Error("Configured agent is missing its policy ID.");
        }
        if (!isDirty) {
          router.replace("/merchant/agent-builder");
          return;
        }
        const updateRes = await updatePolicy(policyId, {
          name: formPolicy.name?.trim() || serverPolicy?.name || "Merchant Commerce Policy",
          description: formPolicy.description?.trim() || serverPolicy?.description,
          isActive: formPolicy.isActive ?? serverPolicy?.isActive ?? true,
          negotiationEnabled: formPolicy.negotiationEnabled ?? serverPolicy?.negotiationEnabled ?? true,
          maxDiscountPercent: Number(formPolicy.maxDiscountPercent ?? serverPolicy?.maxDiscountPercent ?? 10),
          minMarginPercent: Number(formPolicy.minMarginPercent ?? serverPolicy?.minMarginPercent ?? 20),
          maxQuantityPerOrder: Number(formPolicy.maxQuantityPerOrder ?? serverPolicy?.maxQuantityPerOrder ?? 50),
          minOrderValue: Number(formPolicy.minOrderValue ?? serverPolicy?.minOrderValue ?? 0),
          maxOrderValue: Number(formPolicy.maxOrderValue ?? serverPolicy?.maxOrderValue ?? 100000),
          autoApprovalEnabled: formPolicy.autoApprovalEnabled ?? serverPolicy?.autoApprovalEnabled ?? true,
          autoApprovalLimit: Number(formPolicy.autoApprovalLimit ?? serverPolicy?.autoApprovalLimit ?? 50000),
          freeShippingThreshold: Number(formPolicy.freeShippingThreshold ?? serverPolicy?.freeShippingThreshold ?? 5000),
          maxNegotiationRounds: Number(formPolicy.maxNegotiationRounds ?? serverPolicy?.maxNegotiationRounds ?? 3),
          allowedCurrencies: formPolicy.allowedCurrencies || serverPolicy?.allowedCurrencies || ["INR"],
        });
        if (updateRes.success && updateRes.data) {
          setServerPolicy(updateRes.data);
          setFormPolicy(updateRes.data);
          setSaveSuccess(true);
        }
      } else {
        // CREATE mode: MUST call POST /api/policies
        const createRes = await createPolicy({
          name: formPolicy.name?.trim() || "Merchant Commerce Policy",
          description: formPolicy.description?.trim() || "Rules for AI commerce negotiations",
          isActive: formPolicy.isActive ?? true,
          negotiationEnabled: formPolicy.negotiationEnabled ?? true,
          maxDiscountPercent: Number(formPolicy.maxDiscountPercent !== undefined ? formPolicy.maxDiscountPercent : 10),
          minMarginPercent: Number(formPolicy.minMarginPercent !== undefined ? formPolicy.minMarginPercent : 20),
          maxQuantityPerOrder: Number(formPolicy.maxQuantityPerOrder !== undefined ? formPolicy.maxQuantityPerOrder : 50),
          minOrderValue: Number(formPolicy.minOrderValue !== undefined ? formPolicy.minOrderValue : 0),
          maxOrderValue: Number(formPolicy.maxOrderValue !== undefined ? formPolicy.maxOrderValue : 100000),
          autoApprovalEnabled: formPolicy.autoApprovalEnabled ?? true,
          autoApprovalLimit: Number(formPolicy.autoApprovalLimit !== undefined ? formPolicy.autoApprovalLimit : 50000),
          freeShippingThreshold: Number(formPolicy.freeShippingThreshold !== undefined ? formPolicy.freeShippingThreshold : 5000),
          maxNegotiationRounds: Number(formPolicy.maxNegotiationRounds !== undefined ? formPolicy.maxNegotiationRounds : 3),
          allowedCurrencies: formPolicy.allowedCurrencies || ["INR"],
        });

        // Ensure merchant agent is active
        if (!agentEnabled || selectedMerchant.agentEnabled !== true) {
          const merchRes = await updateMerchant(selectedMerchant._id, {
            agentEnabled: true,
            agentDescription: agentDescription || "Automated sales & negotiation agent",
          });
          if (merchRes.success && merchRes.data) {
            setSelectedMerchant(merchRes.data);
          }
        }

        if (createRes.success && createRes.data) {
          setServerPolicy(createRes.data);
          setFormPolicy(createRes.data);
          setPolicyId(createRes.data._id || null);
          setMode("EDIT");
          setSaveSuccess(true);
        }
      }

      router.replace("/merchant/agent-builder");
    } catch (err: unknown) {
      const e = err as { message?: string };
      console.error("Save policy failed:", err);
      setError(e?.message || "Unable to save agent configuration.");
    } finally {
      setSaving(false);
    }
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

  // Missing merchant state
  if (!selectedMerchant && !merchantLoading) {
    return (
      <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
        <div className="border border-border rounded-xl p-12 text-center bg-card space-y-4 shadow-2xs">
          <div className="inline-flex h-12 w-12 rounded-full bg-amber-500/10 text-amber-600 items-center justify-center">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg text-foreground">No Merchant Account Found</h3>
            <p className="text-sm text-muted-foreground">
              No active merchant profile was found in the database. Please create a merchant profile or seed merchant data first.
            </p>
          </div>
          <Button variant="outline" onClick={loadPolicyAndData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Server Error state (only for genuine 500 / network errors)
  if (error) {
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

  const isAgentActive = serverPolicy !== null && agentEnabled && (formPolicy.negotiationEnabled ?? true);

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
              Configure Negotiation Agent
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {mode === "CREATE"
              ? "Define commercial policy and negotiation boundaries for your AI agent."
              : "Update commercial policy and negotiation boundaries for your AI agent."}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {mode === "EDIT" && isDirty && (
            <Button variant="outline" size="sm" onClick={handleDiscard} disabled={saving}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Discard Changes
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" />
                {mode === "EDIT" ? "Save Changes" : "Create Agent"}
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

      {isDirty && !saveSuccess && mode === "EDIT" && (
        <div className="p-3 rounded-md bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200 text-xs flex items-center justify-between border border-amber-200 dark:border-amber-800">
          <span>You have unsaved changes. Click &quot;Save Changes&quot; to apply.</span>
          <span className="font-semibold text-[11px] uppercase tracking-wider">Unsaved</span>
        </div>
      )}

      {/* Normal Configuration Tabs */}
      {(
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

                <div className="space-y-2">
                  <label htmlFor="policyName" className="text-xs font-medium text-foreground">
                    Policy Name
                  </label>
                  <Input
                    id="policyName"
                    value={formPolicy.name ?? ""}
                    onChange={(e) => handlePolicyChange("name", e.target.value)}
                    placeholder="Merchant Commerce Policy"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Name for this commercial policy.
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
                    placeholder="10"
                    value={getFieldValue("maxDiscountPercent", 10)}
                    onChange={(e) => handlePolicyChange("maxDiscountPercent", e.target.value === "" ? undefined : Number(e.target.value))}
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
                    placeholder="20"
                    value={getFieldValue("minMarginPercent", 20)}
                    onChange={(e) => handlePolicyChange("minMarginPercent", e.target.value === "" ? undefined : Number(e.target.value))}
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
                    placeholder="3"
                    value={getFieldValue("maxNegotiationRounds", 3)}
                    onChange={(e) => handlePolicyChange("maxNegotiationRounds", e.target.value === "" ? undefined : Number(e.target.value))}
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
                    placeholder="5000"
                    value={getFieldValue("freeShippingThreshold", 5000)}
                    onChange={(e) => handlePolicyChange("freeShippingThreshold", e.target.value === "" ? undefined : Number(e.target.value))}
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
                    placeholder="50"
                    value={getFieldValue("maxQuantityPerOrder", 50)}
                    onChange={(e) => handlePolicyChange("maxQuantityPerOrder", e.target.value === "" ? undefined : Number(e.target.value))}
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
                    placeholder="0"
                    value={getFieldValue("minOrderValue", 0)}
                    onChange={(e) => handlePolicyChange("minOrderValue", e.target.value === "" ? undefined : Number(e.target.value))}
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
                    placeholder="100000"
                    value={getFieldValue("maxOrderValue", 100000)}
                    onChange={(e) => handlePolicyChange("maxOrderValue", e.target.value === "" ? undefined : Number(e.target.value))}
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
                    placeholder="50000"
                    value={getFieldValue("autoApprovalLimit", 50000)}
                    onChange={(e) => handlePolicyChange("autoApprovalLimit", e.target.value === "" ? undefined : Number(e.target.value))}
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
