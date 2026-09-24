import type { LeadSource, LeadStatus } from "@/modules/buy-from-me/leads/domain";

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

export type Service = {
  id: string;
  business_id: string;
  name: string;
  active: boolean;
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
      services: Table<
        Service,
        { business_id: string; name: string; active?: boolean; id?: string },
        { name?: string; active?: boolean }
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
    Functions: { [_ in never]: never };
    Enums: {
      business_role: BusinessRole;
      business_status: BusinessStatus;
      membership_status: MembershipStatus;
      lead_status: LeadStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
