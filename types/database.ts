export type StaffRole = 'owner' | 'mechanic' | 'staff';
export type BookingStatus = 'requested' | 'confirmed' | 'cancelled' | 'completed';
export type QueueSource = 'website_booking' | 'dashboard_quick_capture';
export type QueueStatus = 'waiting' | 'dropped_off' | '';
export type Priority = 'urgent' | 'high' | '';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped';
export type JobStatus = 'scheduled' | 'checked_in' | 'in_progress' | 'waiting_parts' | 'paused' | 'ready' | 'completed';
export type SpamStatus = 'clean' | 'suspected' | 'blocked';

export type DashboardData = {
  bookings: BookingRequest[];
  customers: Customer[];
  vehicles: Vehicle[];
  queueItems: QueueItem[];
  appointments: Appointment[];
  notifications: NotificationEvent[];
  shopHours: ShopHour[];
  specialHours: SpecialHour[];
  blockedTimes: BlockedTime[];
};

export type BookingRequest = {
  id: string;
  reference: string;
  status: BookingStatus;
  customer_id: string | null;
  vehicle_id: string | null;
  customer_name: string;
  phone: string;
  normalized_phone: string;
  email: string;
  vehicle_description: string;
  service_needed: string;
  preferred_date: string;
  preferred_time: string;
  notes: string | null;
  spam_status: SpamStatus;
  spam_score: number;
  spam_reasons: string[];
  submitted_ip_hash: string | null;
  turnstile_verified: boolean;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  name: string | null;
  phone: string | null;
  normalized_phone: string | null;
  email: string | null;
  is_temporary: boolean;
  created_at: string;
  updated_at: string;
};

export type Vehicle = {
  id: string;
  customer_id: string | null;
  description: string | null;
  license_plate: string | null;
  vin: string | null;
  created_at: string;
  updated_at: string;
};

export type QueueItem = {
  id: string;
  source: QueueSource;
  booking_request_id: string | null;
  queue_date: string;
  quick_note: string;
  customer_id: string | null;
  vehicle_id: string | null;
  customer_name: string | null;
  phone: string | null;
  normalized_phone: string | null;
  email: string | null;
  vehicle_description: string | null;
  license_plate: string | null;
  vin: string | null;
  service_needed: string | null;
  waiting_status: QueueStatus;
  priority: Priority;
  payment_status: string | null;
  follow_up_scheduled: boolean;
  missing_fields: string[];
  is_incomplete: boolean;
  created_at: string;
  updated_at: string;
};

export type Appointment = {
  id: string;
  booking_request_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  appointment_date: string;
  appointment_time: string;
  status: BookingStatus;
  job_status: JobStatus;
  estimated_hours: number | null;
  actual_hours: number | null;
  billable_hours: number | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationEvent = {
  id: string;
  booking_request_id: string | null;
  appointment_id: string | null;
  channel: 'email' | 'sms' | 'owner_alert';
  event_type: string;
  recipient: string;
  subject: string | null;
  body: string;
  status: NotificationStatus;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
};

export type ShopHour = {
  id: string;
  day_of_week: number;
  is_open: boolean;
  opens_at: string | null;
  closes_at: string | null;
  slot_interval_minutes: number;
  created_at: string;
  updated_at: string;
};

export type SpecialHour = {
  id: string;
  special_date: string;
  is_open: boolean;
  opens_at: string | null;
  closes_at: string | null;
  slot_interval_minutes: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BlockedTime = {
  id: string;
  block_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
