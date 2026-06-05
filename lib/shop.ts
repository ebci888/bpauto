import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications';
import { clean, missingFields, normalizePhone, referenceCode, todayKey, upperClean } from '@/lib/text';

const hoursSchema = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? null : Number(value)),
  z.number().nonnegative().nullable()
);

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
  appointment_time: z.string().trim().min(1),
  job_status: z.string().optional().default('scheduled'),
  estimated_hours: hoursSchema.optional().default(null),
  actual_hours: hoursSchema.optional().default(null),
  billable_hours: hoursSchema.optional().default(null),
  internal_notes: z.string().optional().default(''),
  notify_customer: z.coerce.boolean().optional().default(true)
});

export const rescheduleAppointmentSchema = z.object({
  appointment_date: z.string().trim().min(1),
  appointment_time: z.string().trim().min(1),
  job_status: z.string().optional().default('scheduled'),
  estimated_hours: hoursSchema.optional().default(null),
  actual_hours: hoursSchema.optional().default(null),
  billable_hours: hoursSchema.optional().default(null),
  internal_notes: z.string().optional().default(''),
  notify_customer: z.coerce.boolean().optional().default(true)
});

export const blockedTimeSchema = z.object({
  block_date: z.string().trim().min(1),
  start_time: z.string().trim().min(1),
  end_time: z.string().trim().min(1),
  reason: z.string().optional().default('')
});

const jobStatuses = new Set(['scheduled', 'checked_in', 'in_progress', 'waiting_parts', 'paused', 'ready', 'completed']);

function minutesFromTime(value: string) {
  const cleaned = clean(value);
  const meridianMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (meridianMatch) {
    let hours = Number(meridianMatch[1]);
    const minutes = Number(meridianMatch[2]);
    const meridian = meridianMatch[3].toUpperCase();
    if (meridian === 'PM' && hours < 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  const [hours = '0', minutes = '0'] = cleaned.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function timeFromMinutes(value: number) {
  const hours24 = Math.floor(value / 60);
  const minutes = value % 60;
  const meridian = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${meridian}`;
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function weekdayFromDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

function overlaps(slotMinutes: number, start: string, end: string) {
  return slotMinutes >= minutesFromTime(start) && slotMinutes < minutesFromTime(end);
}

function cleanJobStatus(value: string | null | undefined) {
  return value && jobStatuses.has(value) ? value : 'scheduled';
}

function nullableHours(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number(value);
}

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

export async function getAvailableSlots(date: string) {
  if (!isDateKey(date)) return [];

  const admin = getSupabaseAdmin();
  const dayOfWeek = weekdayFromDateKey(date);
  const [{ data: hours, error: hoursError }, { data: blocks, error: blocksError }, { data: appointments, error: appointmentsError }, { data: bookings, error: bookingsError }] =
    await Promise.all([
      admin.from('shop_hours').select('*').eq('day_of_week', dayOfWeek).maybeSingle(),
      admin.from('blocked_times').select('*').eq('block_date', date),
      admin.from('appointments').select('appointment_time').eq('appointment_date', date).eq('status', 'confirmed'),
      admin.from('booking_requests').select('preferred_time').eq('preferred_date', date).eq('status', 'requested')
    ]);

  if (hoursError) throw hoursError;
  if (blocksError) throw blocksError;
  if (appointmentsError) throw appointmentsError;
  if (bookingsError) throw bookingsError;
  if (!hours?.is_open || !hours.opens_at || !hours.closes_at) return [];

  const taken = new Set([
    ...(appointments ?? []).map((appointment) => clean(appointment.appointment_time)),
    ...(bookings ?? []).map((booking) => clean(booking.preferred_time))
  ]);
  const slots: string[] = [];
  const start = minutesFromTime(hours.opens_at);
  const end = minutesFromTime(hours.closes_at);
  const interval = hours.slot_interval_minutes || 60;

  for (let slot = start; slot < end; slot += interval) {
    const label = timeFromMinutes(slot);
    const blocked = (blocks ?? []).some((block) => overlaps(slot, block.start_time, block.end_time));
    if (!blocked && !taken.has(label)) slots.push(label);
  }

  return slots;
}

export async function createBlockedTime(raw: unknown, createdBy?: string | null) {
  const input = blockedTimeSchema.parse(raw);
  if (minutesFromTime(input.start_time) >= minutesFromTime(input.end_time)) {
    throw new Error('Blocked time must end after it starts.');
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('blocked_times')
    .insert({
      block_date: input.block_date,
      start_time: input.start_time,
      end_time: input.end_time,
      reason: clean(input.reason) || null,
      created_by: createdBy ?? null
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBlockedTime(id: string) {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from('blocked_times').delete().eq('id', id);
  if (error) throw error;
  return { ok: true };
}

export async function createWebsiteBooking(raw: unknown) {
  const input = bookingRequestSchema.parse(raw);
  const admin = getSupabaseAdmin();
  const slots = await getAvailableSlots(input.preferred_date);
  if (!slots.includes(input.preferred_time)) {
    throw new Error('That time is no longer available. Please choose another time.');
  }

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
      status: 'confirmed',
      job_status: cleanJobStatus(input.job_status),
      estimated_hours: nullableHours(input.estimated_hours),
      actual_hours: nullableHours(input.actual_hours),
      billable_hours: nullableHours(input.billable_hours),
      internal_notes: clean(input.internal_notes) || null
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

  if (input.notify_customer) {
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
  }

  return appointment;
}

export async function rescheduleAppointment(id: string, raw: unknown) {
  const input = rescheduleAppointmentSchema.parse(raw);
  const admin = getSupabaseAdmin();
  const { data: appointment, error: appointmentError } = await admin.from('appointments').select('*').eq('id', id).single();
  if (appointmentError) throw appointmentError;

  const { data: existing } = await admin
    .from('appointments')
    .select('id')
    .eq('appointment_date', input.appointment_date)
    .eq('appointment_time', input.appointment_time)
    .eq('status', 'confirmed')
    .neq('id', id)
    .maybeSingle();
  if (existing) {
    throw new Error('That appointment slot is already confirmed.');
  }

  const { data: updatedAppointment, error: updateAppointmentError } = await admin
    .from('appointments')
    .update({
      appointment_date: input.appointment_date,
      appointment_time: input.appointment_time,
      job_status: cleanJobStatus(input.job_status),
      estimated_hours: nullableHours(input.estimated_hours),
      actual_hours: nullableHours(input.actual_hours),
      billable_hours: nullableHours(input.billable_hours),
      internal_notes: clean(input.internal_notes) || null
    })
    .eq('id', id)
    .select('*')
    .single();
  if (updateAppointmentError) throw updateAppointmentError;

  let booking = null;
  if (appointment.booking_request_id) {
    const { data: bookingData, error: bookingError } = await admin
      .from('booking_requests')
      .update({
        preferred_date: input.appointment_date,
        preferred_time: input.appointment_time
      })
      .eq('id', appointment.booking_request_id)
      .select('*')
      .single();
    if (bookingError) throw bookingError;
    booking = bookingData;
  }

  if (booking && input.notify_customer) {
    await Promise.all([
      createNotification({
        bookingRequestId: booking.id,
        appointmentId: updatedAppointment.id,
        channel: 'email',
        eventType: 'customer_appointment_rescheduled_email',
        recipient: booking.email,
        subject: `BP Auto Repair updated your appointment ${booking.reference}`,
        body: `Hi ${booking.customer_name}, your ${booking.service_needed} appointment has been updated to ${input.appointment_date} at ${input.appointment_time}.`
      }),
      createNotification({
        bookingRequestId: booking.id,
        appointmentId: updatedAppointment.id,
        channel: 'sms',
        eventType: 'customer_appointment_rescheduled_sms',
        recipient: booking.phone,
        body: `BP Auto Repair updated your appointment to ${input.appointment_date} at ${input.appointment_time}.`
      })
    ]);
  }

  return updatedAppointment;
}

export async function getDashboardData() {
  const admin = getSupabaseAdmin();
  const [bookings, customers, vehicles, queueItems, appointments, notifications, shopHours, blockedTimes] = await Promise.all([
    admin.from('booking_requests').select('*').order('created_at', { ascending: false }).limit(100),
    admin.from('customers').select('*').order('updated_at', { ascending: false }).limit(100),
    admin.from('vehicles').select('*').order('updated_at', { ascending: false }).limit(100),
    admin.from('queue_items').select('*').order('created_at', { ascending: false }).limit(100),
    admin.from('appointments').select('*').order('created_at', { ascending: false }).limit(100),
    admin.from('notification_events').select('*').order('created_at', { ascending: false }).limit(100),
    admin.from('shop_hours').select('*').order('day_of_week', { ascending: true }),
    admin.from('blocked_times').select('*').order('block_date', { ascending: true }).order('start_time', { ascending: true }).limit(100)
  ]);

  for (const result of [bookings, customers, vehicles, queueItems, appointments, notifications, shopHours, blockedTimes]) {
    if (result.error) throw result.error;
  }

  return {
    bookings: bookings.data ?? [],
    customers: customers.data ?? [],
    vehicles: vehicles.data ?? [],
    queueItems: queueItems.data ?? [],
    appointments: appointments.data ?? [],
    notifications: notifications.data ?? [],
    shopHours: shopHours.data ?? [],
    blockedTimes: blockedTimes.data ?? []
  };
}
