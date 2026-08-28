import mongoose from "mongoose";
import AuditEvent, {
  type IAuditEvent,
  type AuditActorType,
  type AuditEventType,
} from "../models/AuditEvent.js";

export interface CreateAuditEventInput {
  merchantId: string | mongoose.Types.ObjectId;
  negotiationId?: string | mongoose.Types.ObjectId;
  agreementId?: string | mongoose.Types.ObjectId;
  approvalId?: string | mongoose.Types.ObjectId;
  eventType: AuditEventType | string;
  actorType: AuditActorType;
  actorId?: string;
  description: string;
  data?: Record<string, any>;
}

export const createAuditEvent = async (
  input: CreateAuditEventInput
): Promise<IAuditEvent> => {
  const auditEvent = new AuditEvent({
    merchantId: input.merchantId,
    negotiationId: input.negotiationId,
    agreementId: input.agreementId,
    approvalId: input.approvalId,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId,
    description: input.description,
    data: input.data,
    createdAt: new Date(),
  });

  return await auditEvent.save();
};

export const getAuditEventsForAgreement = async (
  agreementId: string
): Promise<IAuditEvent[]> => {
  if (!mongoose.Types.ObjectId.isValid(agreementId)) {
    return [];
  }
  return await AuditEvent.find({ agreementId }).sort({ createdAt: 1 });
};

export const getAuditEventsForNegotiation = async (
  negotiationId: string
): Promise<IAuditEvent[]> => {
  if (!mongoose.Types.ObjectId.isValid(negotiationId)) {
    return [];
  }
  return await AuditEvent.find({ negotiationId }).sort({ createdAt: 1 });
};
