/** Marketing integration settings stored in site_settings table (JSONB) */
export interface MarketingSettings {
  meta_pixel_id?: string;
  meta_capi_token?: string;
  meta_tracking_enabled?: boolean;
  meta_test_event_code?: string;
  gtm_id?: string;
  klaviyo_list_id?: string;
  klaviyo_company_id?: string;
}

/** Shape of a single Meta Conversions API event */
export interface MetaEventPayload {
  event_name: string;
  event_id: string;
  event_time: number;
  event_source_url: string;
  action_source: "website";
  user_data: {
    client_ip_address?: string;
    client_user_agent?: string;
    fbp?: string;
    fbc?: string;
    external_id?: string;
    em?: string;   // hashed email
    ph?: string;   // hashed phone
    fn?: string;   // hashed first name
    ln?: string;   // hashed last name
  };
  custom_data?: Record<string, unknown>;
}

/** Request body sent from client to POST /api/meta/capi */
export interface MetaCAPIRequest {
  event_name: string;
  event_id: string;
  event_source_url: string;
  user_data?: {
    fbp?: string;
    fbc?: string;
    external_id?: string;
    em?: string;
    ph?: string;
    fn?: string;
    ln?: string;
  };
  custom_data?: Record<string, unknown>;
}
