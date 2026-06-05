import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications';
import { clean, missingFields, normalizePhone, referenceCode, todayKey, upperClean } from '@/lib/text';

export const bookingRequestSchema = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  phone: z.string().trim().min(7),
  email: z.string().trim().email(),
  vehicle: z.string().trim().min(1),
  service: z.string().trim().min(1),
  preferred_date: z.string().trim().min(1),
  preferred_time: z.string().trim().min(1),
  notes: z.string().optional().default('')
});

export const quickCaptureSchema = z.object({
  quick_note: z.string().trim().min(1),
  customer_name: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z.string().optional().default(''),
  vehicle_description: z.string().optional().default(''),
  license_plate: z.string().optional().default(''),
  vin: z.string().optional().default(''),
  service_needed: z.string().optional().default(''),
  waiting_status: z.string().optional().default(''),
  priority: z.string().optional().default('')
});

export const confirmBookingSchema = z.object({
  appointment_date: z.string().trim().min(1),
  appointment_time: z.string().trim().min(1)
});

async function touchCustomer(input: {
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
}) {
  const admin = getSupabaseAdmin();
  const name = clean(input.name || `${clean(input.firstName)} ${clean(input.lastName)}`);
  const normalized = normalizePhone(input.phone);
  const email = clean(input.email).toLowerCase();

  if (!name && !normalized && !email) return null;

  const findByPhone = normalized
    ? await admin.from('customers').select('*').eq('normalized_phone', normalized).maybeSingle()
    : { data: null, error: null };
  if (findByPhone.error) throw findByPhone.error;

  const findByEmail =
    !findByPhone.data && email
      ? await admin.from('customers').select('*').ilike('email', email).maybeSingle()
      : { data: null, error: null };
  if (findByEmail.error) throw findByEmail.error;

  const existing = findByPhone.data || findByEmail.data;
  if (existing) {
    const { data, error } = await admin
      .from('customers')
      .update({
        name: name || existing.name,
        phone: clean(input.phone) || existing.phone,
        normalized_phone: normalized || existing.normalized_phone,
        email: clean(input.email) || existing.email,
        is_temporary: false
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await admin
    .from('customers')
    .insert({
      name: name || null,
      phone: clean(input.phone) || null,
      normalized_phone: normalized || null,
      email: clean(input.email) || null,
      is_temporary: !normalized
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function touchVehicle(input: {
  customerId?: string | null;
  description?: string;
  licensePlate?: string;
  vin?: string;
}) {
  const admin = getSupabaseAdmin();
  const description = clean(input.description);
  const licensePlate = upperClean(input.licensePlate);
  const vin = upperClean(input.vin);

  if (!description && !licensePlate && !vin) return null;

  const findByVin = vin ? await admin.from('vehicles').select('*').eq('vin', vin).maybeSingle() : { data: null, error: null };
  if (findByVin.error) throw findByVin.error;

  const findByPlate =
    !findByVin.data && licensePlate
      ? await admin.from('vehicles').select('*').eq('license_plate', licensePlate).maybeSingle()
      : { data: null, error: null };
  if (findByPlate.error) throw findByPlate.error;

  const existing = findByVin.data || findByPlate.data;
  if (existing) {
    const { data, error } = await admin
      .from('vehicles')
      .update({
        customer_id: input.customerId || existing.customer_id,
        description: description || existing.description,
        license_plate: licensePlate || existing.license_plate,
        vin: vin || existing.vin
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await admin
    .from('vehicles')
    .insert({
      customer_id: input.customerId || null,
      description: description || null,
      license_plate: licensePlate || null,
      vin: vin || null
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function createWebsiteBooking(raw: unknown) {
  const input = bookingRequestSchema.parse(raw);
  const admin = getSupabaseAdmin();
  const customerName = `${input.first_name} ${input.last_name}`;
  const normalizedPhone = normalizePhone(input.phone);
  const customer = await touchCustomer({
    firstName: input.first_name,
    lastName: input.last_name,
    phone: input.phone,
    email: input.email
  });
  const vehicle = await touchVehicle({
    customerId: customer?.id,
    description: input.vehicle
  });

  const { data: booking, error: bookingError } = await admin
    .from('booking_requests')
    .insert({
      reference: referenceCode(),
      customer_id: customer?.id ?? null,
      vehicle_id: vehicle?.id ?? null,
      customer_name: customerName,
      phone: input.phone,
      normalized_phone: normalizedPhone,
      email: input.email,
      vehicle_description: input.vehicle,
      service_needed: input.service,
      preferred_date: input.preferred_date,
      preferred_time: input.preferred_time,
      notes: input.notes || null
    })
    .select('*')
    .single();
  if (bookingError) throw bookingError;

  const queueBase = {
    customer_name: customerName,
    normalized_phone: normalizedPhone,
    vehicle_description: input.vehicle,
    service_needed: input.service,
    payment_status: null,
    follow_up_scheduled: false
  };

  const { data: queueItem, error: queueError } = await admin
    .from('queue_items')
    .insert({
      source: 'website_booking',
      booking_request_id: booking.id,
      queue_date: todayKey(),
      quick_note: `${customerName}, ${input.phone}, ${input.vehicle}, ${input.service}, requested ${input.preferred_date} ${input.preferred_time}`,
      customer_id: customer?.id ?? null,
      vehicle_id: vehicle?.id ?? null,
      customer_name: customerName,
      phone: input.phone,
      normalized_phone: normalizedPhone,
      email: input.email,
      vehicle_description: input.vehicle,
      service_needed: input.service,
      missing_fields: missingFields(queueBase),
      is_incomplete: true
    })
    .select('*')
    .single();
  if (queueError) throw queueError;

  await Promise.all([
    createNotification({
      bookingRequestId: booking.id,
      channel: 'owner_alert',
      eventType: 'owner_new_booking_request',
      recipient: 'owner',
      subject: `New booking request ${booking.reference}`,
      body: `${customerName} requested ${input.service} for ${input.vehicle} on ${input.preferred_date} at ${input.preferred_time}. Phone: ${input.phone}.`
    }),
    createNotification({
      bookingRequestId: booking.id,
      channel: 'email',
      eventType: 'customer_request_received_email',
      recipient: input.email,
      subject: `BP Auto Repair received your request ${booking.reference}`,
      body: `Hi ${input.first_name}, we received your ${input.service} request for ${input.preferred_date} at ${input.preferred_time}. The shop will confirm the appointment soon.`
    }),
    createNotification({
      bookingRequestId: booking.id,
      channel: 'sms',
      eventType: 'customer_request_received_sms',
      recipient: input.phone,
      body: `BP Auto Repair received your request ${booking.reference} for ${input.preferred_date} at ${input.preferred_time}. We will confirm soon.`
    })
  ]);

  return { booking, queueItem, customer, vehicle };
}

export async function createQuickCapture(raw: unknown) {
  const input = quickCaptureSchema.parse(raw);
  const admin = getSupabaseAdmin();
  const customer = await touchCustomer({
    name: input.customer_name,
    phone: input.phone,
    email: input.email
  });
  const vehicle = await touchVehicle({
    customerId: customer?.id,
    description: input.vehicle_description,
    licensePlate: input.license_plate,
    vin: input.vin
  });
  const normalizedPhone = normalizePhone(input.phone);
  const base = {
    customer_name: clean(input.customer_name) || null,
    normalized_phone: normalizedPhone || null,
    vehicle_description: clean(input.vehicle_description) || null,
    license_plate: upperClean(input.license_plate) || null,
    vin: upperClean(input.vin) || null,
    service_needed: clean(input.service_needed) || null,
    payment_status: null,
    follow_up_scheduled: false
  };
  const missing = missingFields(base);

  const { data, error } = await admin
    .from('queue_items')
    .insert({
      source: 'dashboard_quick_capture',
      queue_date: todayKey(),
      quick_note: input.quick_note,
      customer_id: customer?.id ?? null,
      vehicle_id: vehicle?.id ?? null,
      customer_name: base.customer_name,
      phone: clean(input.phone) || null,
      normalized_phone: normalizedPhone || null,
      email: clean(input.email) || null,
      vehicle_description: base.vehicle_description,
      license_plate: base.license_plate,
      vin: base.vin,
      service_needed: base.service_needed,
      waiting_status: input.waiting_status,
      priority: input.priority,
      missing_fields: missing,
      is_incomplete: missing.length > 0
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateQueueItem(id: string, raw: Record<string, unknown>) {
  const admin = getSupabaseAdmin();
  const { data: current, error: findError } = await admin.from('queue_items').select('*').eq('id', id).single();
  if (findError) throw findError;

  const next = {
    customer_name: raw.customer_name === undefined ? current.customer_name : clean(raw.customer_name) || null,
    phone: raw.phone === undefined ? current.phone : clean(raw.phone) || null,
    normalized_phone: raw.phone === undefined ? current.normalized_phone : normalizePhone(raw.phone) || null,
    email: raw.email === undefined ? current.email : clean(raw.email) || null,
    vehicle_description: raw.vehicle_description === undefined ? current.vehicle_description : clean(raw.vehicle_description) || null,
    service_needed: raw.service_needed === undefined ? current.service_needed : clean(raw.service_needed) || null,
    waiting_status: raw.waiting_status === undefined ? current.waiting_status : clean(raw.waiting_status),
    priority: raw.priority === undefined ? current.priority : clean(raw.priority),
    payment_status: raw.payment_status === undefined ? current.payment_status : clean(raw.payment_status) || null,
    follow_up_scheduled:
      raw.follow_up_scheduled === undefined ? current.follow_up_scheduled : Boolean(raw.follow_up_scheduled)
  };
  const missing = missingFields(next);

  const { data, error } = await admin
    .from('queue_items')
    .update({
      ...next,
      missing_fields: missing,
      is_incomplete: missing.length > 0
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function confirmBookingRequest(id: string, raw: unknown) {
  const input = confirmBookingSchema.parse(raw);
  const admin = getSupabaseAdmin();
  const { data: booking, error: bookingError } = await admin.from('booking_requests').select('*').eq('id', id).single();
  if (bookingError) throw bookingError;

  const { data: existing } = await admin
    .from('appointments')
    .select('id')
    .eq('appointment_date', input.appointment_date)
    .eq('appointment_time', input.appointment_time)
    .eq('status', 'confirmed')
    .maybeSingle();
  if (existing) {
    throw new Error('That appointment slot is already confirmed.');
  }

  const { data: appointment, error: appointmentError } = await admin
    .from('appointments')
    .insert({
      booking_request_id: booking.id,
      customer_id: booking.customer_id,
      vehicle_id: booking.vehicle_id,
      appointment_date: input.appointment_date,
      appointment_time: input.appointment_time,
      status: 'confirmed'
    })
    .select('*')
    .single();
  if (appointmentError) throw appointmentError;

  const { error: updateBookingError } = await admin
    .from('booking_requests')
    .update({
      status: 'confirmed',
      preferred_date: input.appointment_date,
      preferred_time: input.appointment_time
    })
    .eq('id', booking.id);
  if (updateBookingError) throw updateBookingError;

  await Promise.all([
    createNotification({
      bookingRequestId: booking.id,
      appointmentId: appointment.id,
      channel: 'email',
      eventType: 'customer_appointment_confirmed_email',
      recipient: booking.email,
      subject: `BP Auto Repair confirmed your appointment ${booking.reference}`,
      body: `Hi ${booking.customer_name}, your ${booking.service_needed} appointment is confirmed for ${input.appointment_date} at ${input.appointment_time}.`
    }),
    createNotification({
      bookingRequestId: booking.id,
      appointmentId: appointment.id,
      channel: 'sms',
      eventType: 'customer_appointment_confirmed_sms',
      recipient: booking.phone,
      body: `BP Auto Repair confirmed your appointment for ${input.appointment_date} at ${input.appointment_time}.`
    })
  ]);

  return appointment;
}

export async function getDashboardData() {
  const admin = getSupabaseAdmin();
  const [bookings, customers, vehicles, queueItems, appointments, notifications] = await Promise.all([
    admin.from('booking_requests').select('*').order('created_at', { ascending: false }).limit(100),
    admin.from('customers').select('*').order('updated_at', { ascending: false }).limit(100),
    admin.from('vehicles').select('*').order('updated_at', { ascending: false }).limit(100),
    admin.from('queue_items').select('*').order('created_at', { ascending: false }).limit(100),
    admin.from('appointments').select('*').order('created_at', { ascending: false }).limit(100),
    admin.from('notification_events').select('*').order('created_at', { ascending: false }).limit(100)
  ]);

  for (const result of [bookings, customers, vehicles, queueItems, appointments, notifications]) {
    if (result.error) throw result.error;
  }

  return {
    bookings: bookings.data ?? [],
    customers: customers.data ?? [],
    vehicles: vehicles.data ?? [],
    queueItems: queueItems.data ?? [],
    appointments: appointments.data ?? [],
    notifications: notifications.data ?? []
  };
}
