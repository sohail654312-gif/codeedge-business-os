import type { LeadSource, LeadStatus, QuoteRequestStatus } from "@/modules/buy-from-me/leads/domain";
import type { ConversationChannel, ConversationStatus, DeliveryStatus, MessageDirection, MessageSenderType } from "@/modules/contact-me/conversations/domain";
import type { AppointmentSource, AppointmentStatus } from "@/modules/booking/domain";

export type BusinessRole = "owner" | "staff";
export type BusinessStatus = "active" | "suspended";
export type MembershipStatus = "active" | "revoked";
export type ExecutionMode = "demo" | "sandbox" | "production";
export type CredentialEnvironment = "sandbox" | "production";
export type VoiceCallStatus =
  | "queued"
  | "ringing"
  | "in_progress"
  | "completed"
  | "failed"
  | "no_answer"
  | "busy"
  | "cancelled";
export type VoiceCallDirection = "inbound" | "outbound";

export type Business = {
  id: string;
  name: string;
  slug: string;
  status: BusinessStatus;
  timezone: string;
  execution_mode: ExecutionMode;
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
  | "lead_converted_to_customer"
  | "appointment_created"
  | "appointment_rescheduled"
  | "appointment_confirmed"
  | "appointment_cancelled"
  | "appointment_completed"
  | "appointment_no_show"
  | "voice_call_started"
  | "voice_call_completed"
  | "voice_call_failed"
  | "voice_handoff_requested"
  | "appointment_created_from_voice";

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
  duration_minutes: number;
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

export type BusinessFaq = {
  id: string;
  business_id: string;
  question: string;
  answer: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type BusinessSettings = {
  business_id: string;
  locale: string;
  lead_notification_email: string;
  notify_new_leads: boolean;
  created_at: string;
  updated_at: string;
};

export type VoiceReceptionistSettings = {
  business_id: string;
  enabled: boolean;
  greeting: string;
  provider: string;
  voice: string;
  preferred_language: string;
  allowed_tools: string[];
  handoff_behavior: "shared_inbox" | "message_only";
  additional_instructions: string;
  created_at: string;
  updated_at: string;
};

export type VoiceCall = {
  id: string;
  business_id: string;
  conversation_id: string;
  lead_id: string | null;
  customer_id: string | null;
  channel_connection_id: string | null;
  provider: string;
  provider_call_id: string | null;
  direction: VoiceCallDirection;
  from_number: string;
  to_number: string;
  status: VoiceCallStatus;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  summary: string;
  disposition: string;
  handoff_required: boolean;
  execution_mode: ExecutionMode;
  provider_environment: CredentialEnvironment | null;
  correlation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Appointment = {
  id: string;
  business_id: string;
  lead_id: string | null;
  customer_id: string | null;
  service_id: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Conversation = {
  id: string;
  business_id: string;
  lead_id: string | null;
  customer_id: string | null;
  channel_connection_id: string | null;
  channel: ConversationChannel;
  status: ConversationStatus;
  subject: string;
  external_thread_id: string | null;
  assigned_user_id: string | null;
  last_message_at: string;
  last_message_preview: string;
  last_message_direction: MessageDirection | null;
  last_message_sender_type: MessageSenderType | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ChannelConnection = {
  id: string;
  business_id: string;
  channel: ConversationChannel;
  provider: string;
  external_account_id: string;
  external_sender_id: string;
  display_address: string;
  credential_key: string;
  credential_environment: CredentialEnvironment;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type EmailChannelSettings = {
  connection_id: string;
  business_id: string;
  sender_name: string;
  sender_email: string;
  reply_to_email: string;
  inbound_email: string;
  created_at: string;
  updated_at: string;
};

export type MessageDelivery = {
  id: string;
  business_id: string;
  message_id: string;
  conversation_id: string;
  connection_id: string;
  provider: string;
  status: DeliveryStatus;
  provider_message_id: string | null;
  error_code: string | null;
  execution_mode: ExecutionMode;
  provider_environment: CredentialEnvironment;
  correlation_id: string | null;
  simulated: boolean;
  created_at: string;
  updated_at: string;
};

export type EmailMessageMetadata = {
  message_id: string;
  business_id: string;
  conversation_id: string;
  connection_id: string;
  provider: string;
  provider_message_id: string | null;
  rfc_message_id: string | null;
  in_reply_to: string | null;
  reference_ids: string[];
  from_address: string;
  to_address: string;
  reply_to_address: string;
  subject: string;
  created_at: string;
};

export type Message = {
  id: string;
  business_id: string;
  conversation_id: string;
  sender_type: MessageSenderType;
  sender_user_id: string | null;
  direction: MessageDirection;
  body: string;
  channel_message_id: string | null;
  request_id: string | null;
  created_at: string;
};

export type WebsiteChatWidget = {
  business_id: string;
  public_id: string;
  enabled: boolean;
  widget_name: string;
  launcher_label: string;
  greeting_text: string;
  welcome_message: string;
  offline_message: string;
  lead_capture_enabled: boolean;
  accent_color: string;
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
          duration_minutes?: number;
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
          | "duration_minutes"
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
      business_faqs: Table<
        BusinessFaq,
        {
          business_id: string;
          question: string;
          answer: string;
          is_active?: boolean;
          display_order?: number;
          id?: string;
        },
        Partial<Pick<
          BusinessFaq,
          | "question"
          | "answer"
          | "is_active"
          | "display_order"
        >>
      >;
      business_settings: Table<
        BusinessSettings,
        {
          business_id: string;
          locale?: string;
          lead_notification_email?: string;
          notify_new_leads?: boolean;
        },
        Partial<Pick<
          BusinessSettings,
          | "locale"
          | "lead_notification_email"
          | "notify_new_leads"
        >>
      >;
      voice_receptionist_settings: Table<
        VoiceReceptionistSettings,
        {
          business_id: string;
          enabled?: boolean;
          greeting?: string;
          provider?: string;
          voice?: string;
          preferred_language?: string;
          allowed_tools?: string[];
          handoff_behavior?: "shared_inbox" | "message_only";
          additional_instructions?: string;
        },
        Partial<Pick<
          VoiceReceptionistSettings,
          | "enabled"
          | "greeting"
          | "provider"
          | "voice"
          | "preferred_language"
          | "allowed_tools"
          | "handoff_behavior"
          | "additional_instructions"
        >>
      >;
      voice_calls: Table<
        VoiceCall,
        never,
        never
      >;
      appointments: Table<
        Appointment,
        never,
        never
      >;
      website_chat_widgets: Table<
        WebsiteChatWidget,
        {
          business_id: string;
          enabled?: boolean;
          widget_name?: string;
          launcher_label?: string;
          greeting_text?: string;
          welcome_message?: string;
          offline_message?: string;
          lead_capture_enabled?: boolean;
          accent_color?: string;
        },
        Partial<Pick<
          WebsiteChatWidget,
          | "enabled"
          | "widget_name"
          | "launcher_label"
          | "greeting_text"
          | "welcome_message"
          | "offline_message"
          | "lead_capture_enabled"
          | "accent_color"
        >>
      >;
      channel_connections: Table<
        ChannelConnection,
        {
          business_id: string;
          channel: ConversationChannel;
          provider: string;
          external_account_id?: string;
          external_sender_id: string;
          display_address?: string;
          credential_key: string;
          enabled?: boolean;
          id?: string;
        },
        Partial<Pick<
          ChannelConnection,
          | "external_account_id"
          | "external_sender_id"
          | "display_address"
          | "credential_key"
          | "enabled"
        >>
      >;
      email_channel_settings: Table<
        EmailChannelSettings,
        {
          connection_id: string;
          business_id: string;
          sender_name?: string;
          sender_email: string;
          reply_to_email?: string;
          inbound_email: string;
        },
        Partial<Pick<
          EmailChannelSettings,
          "sender_name" | "sender_email" | "reply_to_email" | "inbound_email"
        >>
      >;
      email_message_metadata: Table<
        EmailMessageMetadata,
        never,
        never
      >;
      message_deliveries: Table<
        MessageDelivery,
        never,
        never
      >;
      conversations: Table<
        Conversation,
        {
          business_id: string;
          lead_id?: string | null;
          customer_id?: string | null;
          channel_connection_id?: string | null;
          channel?: ConversationChannel;
          status?: ConversationStatus;
          subject?: string;
          created_by: string;
          id?: string;
        },
        { status?: ConversationStatus }
      >;
      messages: Table<
        Message,
        {
          business_id: string;
          conversation_id: string;
          sender_type: MessageSenderType;
          sender_user_id: string;
          direction: MessageDirection;
          body: string;
          request_id?: string | null;
          id?: string;
        },
        never
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
      voice_start_demo_call: {
        Args: {
          p_business_id: string;
          p_user_id: string;
          p_correlation_id: string;
          p_contact_name: string;
          p_contact_phone: string;
        };
        Returns: Array<{
          voice_call_id: string;
          conversation_id: string;
          lead_id: string;
          created: boolean;
        }>;
      };
      create_appointment: {
        Args: {
          p_business_id: string;
          p_lead_id: string | null;
          p_customer_id: string | null;
          p_service_id: string | null;
          p_contact_name: string;
          p_contact_email: string;
          p_contact_phone: string;
          p_starts_at: string;
          p_ends_at: string;
          p_source: string;
          p_notes: string;
        };
        Returns: string;
      };
      reschedule_appointment: {
        Args: {
          p_appointment_id: string;
          p_starts_at: string;
          p_ends_at: string;
        };
        Returns: boolean;
      };
      set_appointment_status: {
        Args: {
          p_appointment_id: string;
          p_status: AppointmentStatus;
        };
        Returns: boolean;
      };
      website_chat_start: {
        Args: { p_widget_id: string; p_session_hash: string };
        Returns: Array<{
          available: boolean;
          widget_name: string;
          launcher_label: string;
          greeting_text: string;
          welcome_message: string;
          offline_message: string;
          lead_capture_enabled: boolean;
          accent_color: string;
          contact_saved: boolean;
        }>;
      };
      website_chat_status: {
        Args: { p_widget_id: string; p_session_hash: string };
        Returns: Array<{
          available: boolean;
          contact_saved: boolean;
          conversation_status: ConversationStatus | null;
        }>;
      };
      website_chat_history: {
        Args: { p_widget_id: string; p_session_hash: string };
        Returns: Array<{
          sender_type: MessageSenderType;
          direction: MessageDirection;
          body: string;
          created_at: string;
        }>;
      };
      website_chat_send: {
        Args: {
          p_widget_id: string;
          p_session_hash: string;
          p_request_id: string;
          p_body: string;
        };
        Returns: boolean;
      };
      website_chat_capture_lead: {
        Args: {
          p_widget_id: string;
          p_session_hash: string;
          p_contact_name: string;
          p_phone: string;
          p_email: string;
        };
        Returns: boolean;
      };
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
      execution_mode: ExecutionMode;
      credential_environment: CredentialEnvironment;
      customer_backoffice_status: CustomerBackofficeStatus;
      crm_activity_type: CrmActivityType;
      lead_status: LeadStatus;
      quote_request_status: QuoteRequestStatus;
      conversation_channel: ConversationChannel;
      conversation_status: ConversationStatus;
      message_sender_type: MessageSenderType;
      message_direction: MessageDirection;
      delivery_status: DeliveryStatus;
      appointment_status: AppointmentStatus;
      voice_call_status: VoiceCallStatus;
      voice_call_direction: VoiceCallDirection;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
