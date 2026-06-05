export function clean(value: unknown) {
  return String(value ?? '').trim();
}

export function normalizePhone(phone: unknown) {
  return clean(phone).replace(/\D/g, '').slice(-10);
}

export function upperClean(value: unknown) {
  return clean(value).toUpperCase();
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function referenceCode(prefix = 'BP') {
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

export function missingFields(item: {
  customer_name?: string | null;
  normalized_phone?: string | null;
  vehicle_description?: string | null;
  license_plate?: string | null;
  vin?: string | null;
  service_needed?: string | null;
  payment_status?: string | null;
  follow_up_scheduled?: boolean | null;
}) {
  const missing: string[] = [];
  if (!item.customer_name) missing.push('Missing customer name');
  if (!item.normalized_phone) missing.push('Missing phone number');
  if (!item.vehicle_description && !item.license_plate && !item.vin) missing.push('Missing vehicle details');
  if (!item.service_needed) missing.push('Missing service notes');
  if (!item.payment_status) missing.push('Missing payment status');
  if (!item.follow_up_scheduled) missing.push('Follow-up not scheduled');
  return missing;
}
