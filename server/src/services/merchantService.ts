import mongoose from "mongoose";
import Merchant, { type IMerchant } from "../models/Merchant.js";
import { AppError } from "../middleware/errorHandler.js";

export const createMerchant = async (
  data: Partial<IMerchant>
): Promise<IMerchant> => {
  if (data.email) {
    const existing = await Merchant.findOne({
      email: data.email.toLowerCase(),
    });
    if (existing) {
      throw new AppError("Merchant with this email already exists", 409);
    }
  }

  try {
    const merchant = new Merchant(data);
    return await merchant.save();
  } catch (error: any) {
    if (error.code === 11000) {
      throw new AppError("Merchant with this email already exists", 409);
    }
    throw error;
  }
};

export const getMerchantById = async (id: string): Promise<IMerchant> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Merchant ID format", 400);
  }

  const merchant = await Merchant.findById(id);
  if (!merchant) {
    throw new AppError("Merchant not found", 404);
  }

  return merchant;
};

export const getAllMerchants = async (): Promise<IMerchant[]> => {
  return await Merchant.find().sort({ createdAt: -1 });
};

export const updateMerchant = async (
  id: string,
  data: Partial<IMerchant>
): Promise<IMerchant> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Merchant ID format", 400);
  }

  if (data.email) {
    const existing = await Merchant.findOne({
      email: data.email.toLowerCase(),
      _id: { $ne: id },
    });
    if (existing) {
      throw new AppError("Merchant with this email already exists", 409);
    }
  }

  try {
    const updated = await Merchant.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      throw new AppError("Merchant not found", 404);
    }

    return updated;
  } catch (error: any) {
    if (error.code === 11000) {
      throw new AppError("Merchant with this email already exists", 409);
    }
    throw error;
  }
};

export const deleteMerchant = async (id: string): Promise<IMerchant> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Merchant ID format", 400);
  }

  const deleted = await Merchant.findByIdAndDelete(id);
  if (!deleted) {
    throw new AppError("Merchant not found", 404);
  }

  return deleted;
};
