import { getSupabaseAdmin } from '@/lib/supabase/admin';

type NotificationInput = {
  bookingRequestId?: string | null;
  appointmentId?: string | null;
  channel: 'email' | 'sms' | 'owner_alert';
  eventType: string;
  recipient: string;
  subject?: string | null;
  body: string;
};

const brevoRequiredEnv = ['BREVO_API_KEY', 'BREVO_FROM_EMAIL'];
const twilioRequiredEnv = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];
const ownerAlertRequiredEnv = ['OWNER_EMAIL'];

type NotificationResult = {
  id: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  channel: NotificationInput['channel'];
  event_type: string;
  provider: string | null;
  provider_message_id?: string | null;
  sent_at?: string | null;
  error?: string | null;
};

function envConfigured(names: string[]) {
  return names.every((name) => Boolean(process.env[name]));
}

function missingEnv(names: string[]) {
  return names.filter((name) => !process.env[name]);
}

function emailConfigured() {
  return envConfigured(brevoRequiredEnv);
}

function smsConfigured() {
  return envConfigured(twilioRequiredEnv) && Boolean(process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID);
}

function brandSms(text: string) {
  return text.trim().startsWith('BP Auto Repair:') ? text.trim() : `BP Auto Repair: ${text.trim()}`;
}

function formatSmsRecipient(to: string) {
  const trimmed = to.trim();
  if (trimmed.startsWith('+')) return trimmed;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  return trimmed;
}

export function getNotificationSetupStatus() {
  return {
    brevo: {
      ready: emailConfigured(),
      requiredEnv: brevoRequiredEnv,
      missingEnv: missingEnv(brevoRequiredEnv),
      optionalEnv: ['BREVO_FROM_NAME']
    },
    twilio: {
      ready: smsConfigured(),
      requiredEnv: [...twilioRequiredEnv, 'TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID'],
      missingEnv: [
        ...missingEnv(twilioRequiredEnv),
        ...(process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID ? [] : ['TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID'])
      ],
      optionalEnv: ['OWNER_PHONE']
    },
    ownerAlerts: {
      ready: envConfigured(ownerAlertRequiredEnv) && (emailConfigured() || smsConfigured()),
      requiredEnv: ownerAlertRequiredEnv,
      missingEnv: missingEnv(ownerAlertRequiredEnv),
      note: 'Owner alerts send by Brevo email when email is configured, or Twilio SMS when OWNER_PHONE and Twilio are configured.'
    }
  };
}

async function sendBrevoEmail(to: string, subject: string, text: string) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY || '',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: {
        email: process.env.BREVO_FROM_EMAIL,
        name: process.env.BREVO_FROM_NAME || 'BP Auto Repair'
      },
      to: [{ email: to }],
      subject,
      textContent: text
    })
  });

  if (!response.ok) {
    throw new Error(`Brevo email failed with ${response.status}`);
  }

  return (await response.json().catch(() => ({}))) as { messageId?: string };
}

async function sendTwilioSms(to: string, bodyText: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const body = new URLSearchParams({
    To: formatSmsRecipient(to),
    Body: brandSms(bodyText)
  });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    body.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
  } else {
    body.set('From', process.env.TWILIO_FROM || '');
  }
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${process.env.TWILIO_AUTH_TOKEN || ''}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    let detail = '';
    try {
      const parsed = JSON.parse(errorBody) as { code?: number; message?: string };
      detail = parsed.message ? `: ${parsed.message}${parsed.code ? ` (${parsed.code})` : ''}` : '';
    } catch {
      detail = errorBody ? `: ${errorBody.slice(0, 180)}` : '';
    }
    throw new Error(`Twilio SMS failed with ${response.status}${detail}`);
  }

  return (await response.json().catch(() => ({}))) as { sid?: string };
}

function notificationSummary(event: NotificationResult, updates: Partial<NotificationResult> = {}) {
  return {
    id: event.id,
    channel: event.channel,
    event_type: event.event_type,
    status: updates.status || event.status,
    provider: updates.provider === undefined ? event.provider : updates.provider,
    provider_message_id: updates.provider_message_id === undefined ? event.provider_message_id ?? null : updates.provider_message_id,
    sent_at: updates.sent_at === undefined ? event.sent_at ?? null : updates.sent_at,
    error: updates.error === undefined ? event.error ?? null : updates.error
  };
}

export async function createNotification(input: NotificationInput) {
  const admin = getSupabaseAdmin();
  const ownerEmailReady = Boolean(process.env.OWNER_EMAIL) && emailConfigured();
  const ownerSmsReady = Boolean(process.env.OWNER_PHONE) && smsConfigured();
  const ownerAlertProvider = ownerEmailReady ? 'brevo' : ownerSmsReady ? 'twilio' : null;
  const provider = input.channel === 'sms' ? 'twilio' : input.channel === 'email' ? 'brevo' : ownerAlertProvider;
  const configured =
    input.channel === 'email'
      ? emailConfigured()
      : input.channel === 'sms'
        ? smsConfigured()
        : Boolean(ownerAlertProvider);

  const recipient =
    input.channel === 'owner_alert'
      ? ownerAlertProvider === 'brevo'
        ? process.env.OWNER_EMAIL || input.recipient
        : ownerAlertProvider === 'twilio'
          ? process.env.OWNER_PHONE || input.recipient
          : input.recipient
      : input.recipient;

  const { data, error } = await admin
    .from('notification_events')
    .insert({
      booking_request_id: input.bookingRequestId ?? null,
      appointment_id: input.appointmentId ?? null,
      channel: input.channel,
      event_type: input.eventType,
      recipient,
      subject: input.subject ?? null,
      body: input.body,
      status: configured ? 'pending' : 'skipped',
      provider
    })
    .select('*')
    .single();

  if (error) throw error;
  if (!configured || !data) return data as NotificationResult;

  try {
    if (input.channel === 'email') {
      const result = await sendBrevoEmail(recipient, input.subject || 'BP Auto Repair', input.body);
      const sentAt = new Date().toISOString();
      await admin
        .from('notification_events')
        .update({ status: 'sent', sent_at: sentAt, provider_message_id: result.messageId ?? null })
        .eq('id', data.id);
      return notificationSummary(data, { status: 'sent', provider_message_id: result.messageId ?? null, sent_at: sentAt });
    } else if (input.channel === 'sms') {
      const result = await sendTwilioSms(recipient, input.body);
      const sentAt = new Date().toISOString();
      await admin
        .from('notification_events')
        .update({ status: 'sent', sent_at: sentAt, provider_message_id: result.sid ?? null })
        .eq('id', data.id);
      return notificationSummary(data, { status: 'sent', provider_message_id: result.sid ?? null, sent_at: sentAt });
    } else if (input.channel === 'owner_alert' && ownerAlertProvider === 'brevo') {
      const result = await sendBrevoEmail(recipient, input.subject || 'New BP Auto Repair alert', input.body);
      const sentAt = new Date().toISOString();
      await admin
        .from('notification_events')
        .update({ status: 'sent', sent_at: sentAt, provider: 'brevo', provider_message_id: result.messageId ?? null })
        .eq('id', data.id);
      return notificationSummary(data, { status: 'sent', provider: 'brevo', provider_message_id: result.messageId ?? null, sent_at: sentAt });
    } else if (input.channel === 'owner_alert' && ownerAlertProvider === 'twilio') {
      const result = await sendTwilioSms(recipient, input.body);
      const sentAt = new Date().toISOString();
      await admin
        .from('notification_events')
        .update({ status: 'sent', sent_at: sentAt, provider: 'twilio', provider_message_id: result.sid ?? null })
        .eq('id', data.id);
      return notificationSummary(data, { status: 'sent', provider: 'twilio', provider_message_id: result.sid ?? null, sent_at: sentAt });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown notification failure';
    await admin
      .from('notification_events')
      .update({ status: 'failed', error: message })
      .eq('id', data.id);
    return notificationSummary(data, { status: 'failed', error: message });
  }

  return data as NotificationResult;
}
