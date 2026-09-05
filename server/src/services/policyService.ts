import mongoose from "mongoose";
import Policy, { type IPolicy } from "../models/Policy.js";
import Merchant from "../models/Merchant.js";
import { AppError } from "../middleware/errorHandler.js";

export interface GetPoliciesQuery {
  merchantId?: string;
  isActive?: string | boolean;
  page?: string | number;
  limit?: string | number;
}

export interface PaginatedPoliciesResponse {
  data: IPolicy[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const createPolicy = async (
  data: Partial<IPolicy>
): Promise<IPolicy> => {
  if (!data.merchantId || !mongoose.Types.ObjectId.isValid(data.merchantId.toString())) {
    throw new AppError("Invalid or missing merchantId", 400);
  }

  const merchantExists = await Merchant.exists({ _id: data.merchantId });
  if (!merchantExists) {
    throw new AppError("Merchant not found", 404);
  }

  const existingPolicy = await Policy.exists({ merchantId: data.merchantId });
  if (existingPolicy) {
    throw new AppError("A policy already exists for this merchant", 409);
  }

  try {
    const policy = new Policy(data);
    return await policy.save();
  } catch (error: any) {
    if (error.code === 11000) {
      throw new AppError("A policy already exists for this merchant", 409);
    }
    throw error;
  }
};

export const getPolicyByMerchantId = async (
  merchantId: string
): Promise<IPolicy> => {
  if (!mongoose.Types.ObjectId.isValid(merchantId)) {
    throw new AppError("Invalid Merchant ID format", 400);
  }

  const policy = await Policy.findOne({ merchantId });
  if (!policy) {
    throw new AppError("Policy not found for this merchant", 404);
  }

  return policy;
};

export const getCurrentPolicyForMerchant = async (
  merchantId: string
): Promise<IPolicy> => getPolicyByMerchantId(merchantId);

export const getPolicyById = async (id: string): Promise<IPolicy> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Policy ID format", 400);
  }

  const policy = await Policy.findById(id);
  if (!policy) {
    throw new AppError("Policy not found", 404);
  }

  return policy;
};

export const getAllPolicies = async (
  query: GetPoliciesQuery
): Promise<PaginatedPoliciesResponse> => {
  const filter: any = {};

  if (query.merchantId) {
    if (!mongoose.Types.ObjectId.isValid(query.merchantId)) {
      throw new AppError("Invalid Merchant ID format", 400);
    }
    filter.merchantId = query.merchantId;
  }

  if (query.isActive !== undefined) {
    if (typeof query.isActive === "boolean") {
      filter.isActive = query.isActive;
    } else if (typeof query.isActive === "string") {
      filter.isActive = query.isActive === "true";
    }
  }

  const page = Math.max(1, parseInt(String(query.page || "1"), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(query.limit || "20"), 10) || 20)
  );
  const skip = (page - 1) * limit;

  const total = await Policy.countDocuments(filter);
  const totalPages = Math.ceil(total / limit) || 1;

  const data = await Policy.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};

export const updatePolicy = async (
  id: string,
  data: Partial<IPolicy>
): Promise<IPolicy> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Policy ID format", 400);
  }

  // Ensure merchantId, _id, createdAt, updatedAt cannot be mutated
  const updateData = { ...data };
  delete (updateData as any).merchantId;
  delete (updateData as any)._id;
  delete (updateData as any).createdAt;
  delete (updateData as any).updatedAt;

  const existingPolicy = await Policy.findById(id);
  if (!existingPolicy) {
    throw new AppError("Policy not found", 404);
  }

  // Cross-field validation merging with existing values
  const minOrderValue = updateData.minOrderValue ?? existingPolicy.minOrderValue;
  const maxOrderValue = updateData.maxOrderValue ?? existingPolicy.maxOrderValue;
  const autoApprovalLimit = updateData.autoApprovalLimit ?? existingPolicy.autoApprovalLimit;

  if (maxOrderValue < minOrderValue) {
    throw new AppError("maxOrderValue cannot be lower than minOrderValue", 400);
  }

  if (autoApprovalLimit > maxOrderValue) {
    throw new AppError("autoApprovalLimit cannot be greater than maxOrderValue", 400);
  }

  try {
    const updated = await Policy.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      throw new AppError("Policy not found", 404);
    }

    return updated;
  } catch (error: any) {
    throw error;
  }
};

export const deletePolicy = async (id: string): Promise<IPolicy> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Policy ID format", 400);
  }

  const deleted = await Policy.findByIdAndDelete(id);
  if (!deleted) {
    throw new AppError("Policy not found", 404);
  }

  return deleted;
};
