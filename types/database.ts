export type StaffRole = 'owner' | 'mechanic' | 'staff';
export type BookingStatus = 'requested' | 'confirmed' | 'cancelled' | 'completed';
export type QueueSource = 'website_booking' | 'dashboard_quick_capture';
export type QueueStatus = 'waiting' | 'dropped_off' | '';
export type Priority = 'urgent' | 'high' | '';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export type DashboardData = {
  bookings: BookingRequest[];
  customers: Customer[];
  vehicles: Vehicle[];
  queueItems: QueueItem[];
  appointments: Appointment[];
  notifications: NotificationEvent[];
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
