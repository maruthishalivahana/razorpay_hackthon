export interface Merchant {
  _id: string;
  name: string;
  businessName: string;
  email: string;
  phone?: string;
  description?: string;
  currency?: string;
  status?: string;
  agentEnabled?: boolean;
  agentDescription?: string;
  apiKey?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MerchantsApiResponse {
  success: boolean;
  data: Merchant[];
}
