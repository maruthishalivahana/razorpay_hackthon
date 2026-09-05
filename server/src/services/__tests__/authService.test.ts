import test, { describe, before } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import User from "../../models/User.js";
import Merchant from "../../models/Merchant.js";
import {
  registerBuyer,
  registerMerchant,
  loginUser,
  getUserProfile,
  verifyToken,
} from "../authService.js";

describe("Auth Service Unit & Integration Tests", () => {
  before(async () => {
    await connectDB();
  });

  test("1. Register buyer creates user record with BUYER role & returns JWT token", async () => {
    const email = `buyer_test_${Date.now()}@example.com`;
    const result = await registerBuyer({
      name: "Alice Buyer",
      email,
      password: "secretPassword123",
      phone: "+1234567890",
    });

    assert.equal(result.user.email, email);
    assert.equal(result.user.name, "Alice Buyer");
    assert.equal(result.user.role, "BUYER");
    assert.ok(result.user.buyerId);
    assert.equal(result.user.merchantId, null);
    assert.ok(result.token);

    // Verify JWT payload
    const decoded = verifyToken(result.token);
    assert.equal(decoded.email, email);
    assert.equal(decoded.role, "BUYER");
  });

  test("2. Register merchant creates Merchant profile and User record linked via merchantId", async () => {
    const email = `merchant_test_${Date.now()}@example.com`;
    const result = await registerMerchant({
      name: "Bob Merchant",
      businessName: "Bob's Supply Store",
      email,
      password: "merchantPassword123",
      currency: "INR",
    });

    assert.equal(result.user.email, email);
    assert.equal(result.user.name, "Bob Merchant");
    assert.equal(result.user.role, "MERCHANT");
    assert.ok(result.user.merchantId);
    assert.ok(result.token);

    // Verify Merchant document exists in DB
    const merchantDoc = await Merchant.findById(result.user.merchantId);
    assert.ok(merchantDoc);
    assert.equal(merchantDoc.businessName, "Bob's Supply Store");
  });

  test("3. Duplicate email registration is rejected with 409", async () => {
    const email = `duplicate_test_${Date.now()}@example.com`;
    await registerBuyer({
      name: "First Buyer",
      email,
      password: "password123",
    });

    await assert.rejects(
      async () => {
        await registerBuyer({
          name: "Second Buyer",
          email,
          password: "anotherPassword123",
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, "EMAIL_ALREADY_EXISTS");
        return true;
      }
    );
  });

  test("4. Login success returns valid JWT token and safe user profile", async () => {
    const email = `login_test_${Date.now()}@example.com`;
    const password = "mySecurePassword456";

    await registerBuyer({
      name: "Login User",
      email,
      password,
    });

    const loginResult = await loginUser({ email, password });
    assert.equal(loginResult.user.email, email);
    assert.ok(loginResult.token);

    // Ensure password hash is not present in safe profile
    assert.equal((loginResult.user as any).passwordHash, undefined);
  });

  test("5. Login with wrong password is rejected with 401 Invalid Credentials", async () => {
    const email = `wrong_pass_${Date.now()}@example.com`;
    await registerBuyer({
      name: "Pass User",
      email,
      password: "correctPassword",
    });

    await assert.rejects(
      async () => {
        await loginUser({
          email,
          password: "wrongPassword",
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.message, "Invalid email or password.");
        return true;
      }
    );
  });

  test("6. Login with unknown email is rejected with 401 (preventing account enumeration)", async () => {
    await assert.rejects(
      async () => {
        await loginUser({
          email: "unknown_user_email_999@example.com",
          password: "somePassword",
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.message, "Invalid email or password.");
        return true;
      }
    );
  });

  test("7. GET current user returns profile without sensitive security fields", async () => {
    const email = `get_profile_${Date.now()}@example.com`;
    const reg = await registerBuyer({
      name: "Profile Test User",
      email,
      password: "password123",
    });

    const profile = await getUserProfile(reg.user.id);
    assert.equal(profile.email, email);
    assert.equal(profile.name, "Profile Test User");
    assert.equal((profile as any).passwordHash, undefined);
  });
});
