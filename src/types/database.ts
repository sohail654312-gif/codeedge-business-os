import type { LeadSource, LeadStatus, QuoteRequestStatus } from "@/modules/buy-from-me/leads/domain";

export type BusinessRole = "owner" | "staff";
export type BusinessStatus = "active" | "suspended";
export type MembershipStatus = "active" | "revoked";

export type Business = {
  id: string;
  name: string;
  slug: string;
  status: BusinessStatus;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type BusinessMembership = {
  business_id: string;
  user_id: string;
  role: BusinessRole;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
};

export type BusinessProfile = {
  business_id: string;
  trading_name: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  description: string;
  category: string;
  logo_alt: string;
  created_at: string;
  updated_at: string;
};

export type CustomerBackofficeStatus = "pending" | "synced" | "failed";

export type CrmActivityType =
  | "lead_created"
  | "lead_edited"
  | "lead_status_changed"
  | "lead_note_added"
  | "quote_request_created"
  | "quote_request_status_changed"
  | "lead_converted_to_customer";

export type CrmActivity = {
  id: string;
  business_id: string;
  lead_id: string;
  event_type: CrmActivityType;
  description: string;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Customer = {
  id: string;
  business_id: string;
  contact_name: string;
  phone: string;
  email: string;
  source_lead_id: string;
  erpnext_customer_id: string | null;
  erpnext_sync_status: CustomerBackofficeStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Service = {
  id: string;
  business_id: string;
  name: string;
  description: string;
  active: boolean;
  starting_price_pence: number | null;
  quote_required: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type ServiceArea = {
  id: string;
  business_id: string;
  name: string;
  postcode: string;
  notes: string;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type OpeningHours = {
  business_id: string;
  weekday: number;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteRequest = {
  id: string;
  business_id: string;
  lead_id: string;
  details: string;
  status: QuoteRequestStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadNote = {
  id: string;
  business_id: string;
  lead_id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Lead = {
  id: string;
  business_id: string;
  contact_name: string;
  phone: string;
  email: string;
  source: LeadSource;
  service_id: string | null;
  enquiry_summary: string;
  status: LeadStatus;
  estimated_value_pence: number | null;
  last_contact_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      crm_activities: Table<
        CrmActivity,
        never,
        never
      >;
      customers: Table<
        Customer,
        {
          business_id: string;
          contact_name: string;
          phone: string;
          email: string;
          source_lead_id: string;
          erpnext_customer_id?: string | null;
          erpnext_sync_status?: CustomerBackofficeStatus;
          created_by: string | null;
          id?: string;
        },
        { erpnext_customer_id?: string | null; erpnext_sync_status?: CustomerBackofficeStatus }
      >;
      businesses: Table<
        Business,
        { name: string; slug: string; timezone?: string; id?: string; status?: BusinessStatus },
        { name?: string; timezone?: string }
      >;
      business_memberships: Table<
        BusinessMembership,
        {
          business_id: string;
          user_id: string;
          role: BusinessRole;
          status?: MembershipStatus;
        },
        { role?: BusinessRole; status?: MembershipStatus }
      >;
      business_profiles: Table<
        BusinessProfile,
        {
          business_id: string;
          trading_name?: string;
          phone?: string;
          email?: string;
          website?: string;
          address?: string;
          description?: string;
          category?: string;
          logo_alt?: string;
        },
        Partial<Pick<
          BusinessProfile,
          | "trading_name"
          | "phone"
          | "email"
          | "website"
          | "address"
          | "description"
          | "category"
          | "logo_alt"
        >>
      >;
      services: Table<
        Service,
        {
          business_id: string;
          name: string;
          description?: string;
          active?: boolean;
          starting_price_pence?: number | null;
          quote_required?: boolean;
          display_order?: number;
          id?: string;
        },
        Partial<Pick<
          Service,
          | "name"
          | "description"
          | "active"
          | "starting_price_pence"
          | "quote_required"
          | "display_order"
        >>
      >;
      service_areas: Table<
        ServiceArea,
        {
          business_id: string;
          name: string;
          postcode?: string;
          notes?: string;
          active?: boolean;
          display_order?: number;
          id?: string;
        },
        Partial<Pick<
          ServiceArea,
          | "name"
          | "postcode"
          | "notes"
          | "active"
          | "display_order"
        >>
      >;
      opening_hours: Table<
        OpeningHours,
        {
          business_id: string;
          weekday: number;
          is_closed?: boolean;
          opens_at?: string | null;
          closes_at?: string | null;
        },
        Partial<Pick<
          OpeningHours,
          | "is_closed"
          | "opens_at"
          | "closes_at"
        >>
      >;
      quote_requests: Table<
        QuoteRequest,
        {
          business_id: string;
          lead_id: string;
          details: string;
          status?: QuoteRequestStatus;
          created_by: string | null;
          id?: string;
        },
        { status?: QuoteRequestStatus }
      >;
      lead_notes: Table<
        LeadNote,
        {
          business_id: string;
          lead_id: string;
          body: string;
          created_by: string | null;
          id?: string;
        },
        never
      >;
      leads: Table<
        Lead,
        Omit<Lead, "id" | "created_at" | "updated_at"> & { id?: string },
        Partial<Pick<
          Lead,
          | "contact_name"
          | "phone"
          | "email"
          | "source"
          | "service_id"
          | "enquiry_summary"
          | "status"
          | "estimated_value_pence"
          | "last_contact_at"
        >>
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      convert_lead_to_customer: {
        Args: { target_lead_id: string };
        Returns: Array<{ customer_id: string; created: boolean }>;
      };
      search_leads: {
        Args: {
          p_business_id: string;
          p_query?: string | null;
          p_status?: LeadStatus | null;
          p_source?: string | null;
          p_service_id?: string | null;
        };
        Returns: Lead[];
      };
    };
    Enums: {
      business_role: BusinessRole;
      business_status: BusinessStatus;
      membership_status: MembershipStatus;
      customer_backoffice_status: CustomerBackofficeStatus;
      crm_activity_type: CrmActivityType;
      lead_status: LeadStatus;
      quote_request_status: QuoteRequestStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
