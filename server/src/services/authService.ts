import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User, { type IUser, type UserRole } from "../models/User.js";
import Merchant, { type IMerchant } from "../models/Merchant.js";
import { env } from "../config/env.js";
import { AppCustomError } from "./negotiationService.js";

export interface RegisterBuyerInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface RegisterMerchantInput {
  name: string;
  businessName: string;
  email: string;
  password: string;
  phone?: string;
  description?: string;
  currency?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  role?: UserRole;
}

export interface SafeUserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  merchantId: string | null;
  buyerId: string | null;
  phone: string | null;
}

export interface AuthResponse {
  token: string;
  user: SafeUserProfile;
}

export const toSafeUserProfile = (user: IUser): SafeUserProfile => {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    merchantId: user.merchantId ? user.merchantId.toString() : null,
    buyerId: user.buyerId ? user.buyerId.toString() : null,
    phone: user.phone || null,
  };
};

export const generateToken = (user: IUser): string => {
  const payload = {
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
    merchantId: user.merchantId ? user.merchantId.toString() : null,
    buyerId: user.buyerId ? user.buyerId.toString() : null,
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: (env.JWT_EXPIRES_IN as any) || "7d",
  });
};

export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    throw new AppCustomError("INVALID_TOKEN", "Authentication token is invalid or expired.", 401);
  }
};

export const registerBuyer = async (input: RegisterBuyerInput): Promise<AuthResponse> => {
  const { name, email, password, phone } = input;

  if (!name || !email || !password) {
    throw new AppCustomError("INVALID_INPUT", "Name, email, and password are required.", 400);
  }

  if (password.length < 6) {
    throw new AppCustomError("WEAK_PASSWORD", "Password must be at least 6 characters.", 400);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new AppCustomError("EMAIL_ALREADY_EXISTS", "A user with this email address already exists.", 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = new mongoose.Types.ObjectId();

  const user = new User({
    _id: userId,
    email: normalizedEmail,
    passwordHash,
    role: "BUYER",
    name: name.trim(),
    phone: phone?.trim(),
    buyerId: userId,
    isActive: true,
  });

  await user.save();
  const token = generateToken(user);

  return {
    token,
    user: toSafeUserProfile(user),
  };
};

export const registerMerchant = async (input: RegisterMerchantInput): Promise<AuthResponse> => {
  const { name, businessName, email, password, phone, description, currency } = input;

  if (!name || !businessName || !email || !password) {
    throw new AppCustomError(
      "INVALID_INPUT",
      "Name, business name, email, and password are required.",
      400
    );
  }

  if (password.length < 6) {
    throw new AppCustomError("WEAK_PASSWORD", "Password must be at least 6 characters.", 400);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new AppCustomError("EMAIL_ALREADY_EXISTS", "A user with this email address already exists.", 409);
  }

  // Check if existing Merchant record already exists for this email (Data linking)
  let merchant: IMerchant | null = await Merchant.findOne({ email: normalizedEmail });
  let createdMerchant = false;
  if (!merchant) {
    merchant = new Merchant({
      name: name.trim(),
      businessName: businessName.trim(),
      email: normalizedEmail,
      phone: phone?.trim(),
      description: description?.trim(),
      currency: (currency || "INR").toUpperCase(),
      status: "active",
      agentEnabled: true,
    });
    await merchant.save();
    createdMerchant = true;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = new User({
    email: normalizedEmail,
    passwordHash,
    role: "MERCHANT",
    name: name.trim(),
    phone: phone?.trim(),
    merchantId: merchant._id,
    isActive: true,
  });

  try {
    await user.save();
  } catch (error) {
    if (createdMerchant) {
      await Merchant.deleteOne({ _id: merchant._id });
    }
    throw error;
  }
  const token = generateToken(user);

  return {
    token,
    user: toSafeUserProfile(user),
  };
};

export const loginUser = async (input: LoginInput): Promise<AuthResponse> => {
  const { email, password, role } = input;

  if (!email || !password) {
    throw new AppCustomError("INVALID_INPUT", "Email and password are required.", 400);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user || !user.isActive) {
    throw new AppCustomError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }

  if (role && user.role !== role) {
    throw new AppCustomError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppCustomError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }

  const token = generateToken(user);

  return {
    token,
    user: toSafeUserProfile(user),
  };
};

export const getUserProfile = async (userId: string): Promise<SafeUserProfile> => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new AppCustomError("INVALID_USER", "Invalid user ID format", 400);
  }

  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw new AppCustomError("USER_NOT_FOUND", "User not found", 404);
  }

  return toSafeUserProfile(user);
};
