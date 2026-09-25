export type ERPNextConnectionStatus = {
  configured: boolean;
  baseUrl: string | null;
  authenticatedUser?: string | null;
  error?: string | null;
};

export type ERPNextListResponse<T> = { data: T[] };
export type ERPNextDocumentResponse<T> = { data: T };

export type ERPNextCustomer = {
  name: string;
  customer_name?: string;
  customer_type?: string;
  customer_group?: string;
  territory?: string;
};

export type ERPNextSalesInvoice = {
  name: string;
  customer?: string;
  customer_name?: string;
  posting_date?: string;
  due_date?: string;
  grand_total?: number;
  outstanding_amount?: number;
  status?: string;
  currency?: string;
};

export type ERPNextLead = {
  name: string;
  lead_name?: string;
  company_name?: string;
  email_id?: string;
  mobile_no?: string;
  status?: string;
  source?: string;
};

export type ERPNextQuotation = {
  name: string;
  party_name?: string;
  transaction_date?: string;
  valid_till?: string;
  grand_total?: number;
  status?: string;
  currency?: string;
};


export type ERPNextCustomerCreateInput = {
  name?: string;
  customer_name: string;
  customer_type: "Individual" | "Company";
  customer_group: string;
  territory: string;
};

export type ERPNextSupplier = {
  name: string;
  supplier_name?: string;
  supplier_group?: string;
  supplier_type?: string;
  country?: string;
};
