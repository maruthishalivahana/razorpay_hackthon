# Merchant Dashboard Frontend API Integration

This document inventories all verified backend endpoints, request/response contracts, and their corresponding UI actions within the Agentic Commerce Merchant Dashboard.

---

## 1. Products API (`/api/products`)

### `GET /api/products`
- **UI Action:** Loads products listing on `/merchant/products` page.
- **Query Params:** `merchantId`, `category`, `status`, `search`, `page`, `limit`.
- **Response Format:**
  ```json
  {
    "success": true,
    "data": [
      {
        "_id": "650000000000000000000001",
        "merchantId": "650000000000000000000000",
        "name": "Office Chair Pro",
        "description": "Ergonomic chair",
        "category": "Furniture",
        "sku": "CHAIR-PRO-01",
        "price": 24000,
        "costPrice": 16000,
        "currency": "INR",
        "inventory": 50,
        "deliveryDays": 3,
        "isNegotiable": true,
        "status": "active"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
  ```

### `POST /api/products`
- **UI Action:** Triggered by `[ + Add Product ]` form modal (`ProductFormDialog`).
- **Request Body:** `{ merchantId, name, description, category, sku, price, costPrice, currency, inventory, deliveryDays, isNegotiable, status }`.
- **Response:** `{ success: true, data: Product }`.

### `GET /api/products/:id`
- **UI Action:** Fetch full details for product detail view (`ProductDetailDialog`).
- **Response:** `{ success: true, data: Product }`.

### `PUT /api/products/:id`
- **UI Action:** Triggered by `[ Edit ]` form modal (`ProductFormDialog`).
- **Request Body:** Partial product payload to update.
- **Response:** `{ success: true, data: Product }`.

### `DELETE /api/products/:id`
- **UI Action:** Triggered by `[ Delete ]` confirmation modal (`ProductDeleteDialog`).
- **Response:** `{ success: true, message: "Product deleted successfully", data: Product }`.

---

## 2. Policy API (`/api/policies`)

### `GET /api/policies/merchant/:merchantId`
- **UI Action:** Loads existing policy configuration on `/merchant/agent-builder`.
- **Response:** `{ success: true, data: Policy }`.

### `PUT /api/policies/:id`
- **UI Action:** Triggered by `[ Save Changes ]` on Agent Builder tab.
- **Request Body:** `{ name, description, isActive, negotiationEnabled, maxDiscountPercent, minMarginPercent, maxQuantityPerOrder, minOrderValue, maxOrderValue, autoApprovalEnabled, autoApprovalLimit, freeShippingThreshold, maxNegotiationRounds, allowedCurrencies }`.
- **Response:** `{ success: true, data: Policy }`.

### `POST /api/policies`
- **UI Action:** Triggered when initializing a policy for a merchant without one.
- **Request Body:** Complete initial policy object.
- **Response:** `{ success: true, data: Policy }`.

---

## 3. Merchant API (`/api/merchants`)

### `GET /api/merchants`
- **UI Action:** Loads current active merchant for context switcher.
- **Response:** `{ success: true, data: Merchant[] }`.

### `PUT /api/merchants/:id`
- **UI Action:** Updates `agentEnabled` status switch and `agentDescription` text.
- **Request Body:** `{ agentEnabled: boolean, agentDescription: string }`.
- **Response:** `{ success: true, data: Merchant }`.

---

## 4. Negotiations API (`/api/negotiations`)

### `GET /api/negotiations`
- **UI Action:** Displays negotiations listing on `/merchant/negotiations`.
- **Query Params:** `merchantId`, `status`, `search`, `page`, `limit`.
- **Response:** `{ success: true, data: Negotiation[], pagination: { page, limit, total, totalPages } }`.

### `GET /api/negotiations/:id`
- **UI Action:** Loads detailed negotiation timeline and terms modal (`NegotiationDetailDialog`).
- **Response:** `{ success: true, data: Negotiation }`.

---

## 5. Payments API (`/api/payments`)

### `POST /api/payments/create-order`
- **UI Action:** Triggered by `PAY_NOW` action button in `BuyerChat.tsx`.
- **Request Body:** `{ agreementId: string }`.
- **Response Format:**
  ```json
  {
    "success": true,
    "data": {
      "keyId": "rzp_test_...",
      "orderId": "order_...",
      "amount": 2160000,
      "currency": "INR",
      "agreementId": "650000000000000000000001"
    }
  }
  ```

### `POST /api/payments/verify`
- **UI Action:** Triggered by Razorpay Checkout success handler callback.
- **Request Body:** `{ agreementId, razorpayPaymentId, razorpayOrderId, razorpaySignature }`.
- **Response Format:**
  ```json
  {
    "success": true,
    "message": "Payment signature verified and captured successfully.",
    "data": {
      "paymentId": "650000000000000000000002",
      "agreementId": "650000000000000000000001",
      "razorpayPaymentId": "pay_...",
      "razorpayOrderId": "order_...",
      "status": "CAPTURED"
    }
  }
  ```

### `GET /api/payments/agreement/:agreementId`
- **UI Action:** Fetches current backend payment status for an agreement.
- **Response Format:** `{ success: true, data: { agreementId, status, razorpayOrderId, ... } }`.

---

## 6. Architectural & Financial Rules Preserved
1. **Single Source of Truth for Shipping:** Only `Policy.freeShippingThreshold` determines free shipping. `Negotiation.freeDelivery` is never used or created.
2. **Authoritative Payment Lifecycle:** `Buyer Chat → PAY_NOW → Agreement APPROVED & paymentReady → Create/Reuse Razorpay Order → Open Razorpay Checkout → Server HMAC Verification → Payment CAPTURED → Agreement COMPLETED`.
3. **No Frontend Financial Logic:** Margins, discounts, counter-offers, payment amounts, and subunit conversions are calculated strictly on the backend.
4. **Zero External LLM Dependency for Payments:** Payment operations (`create-order`, `verify`, `getPaymentStatus`) are completely deterministic.

