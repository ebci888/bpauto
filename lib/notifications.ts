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

function emailConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_FROM_EMAIL);
}

function smsConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
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
    From: process.env.TWILIO_FROM || '',
    To: to,
    Body: bodyText
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${process.env.TWILIO_AUTH_TOKEN || ''}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Twilio SMS failed with ${response.status}`);
  }

  return (await response.json().catch(() => ({}))) as { sid?: string };
}

export async function createNotification(input: NotificationInput) {
  const admin = getSupabaseAdmin();
  const provider = input.channel === 'sms' ? 'twilio' : input.channel === 'email' ? 'brevo' : null;
  const configured =
    input.channel === 'email'
      ? emailConfigured()
      : input.channel === 'sms'
        ? smsConfigured()
        : (Boolean(process.env.OWNER_EMAIL) && emailConfigured()) || (Boolean(process.env.OWNER_PHONE) && smsConfigured());

  const recipient =
    input.channel === 'owner_alert'
      ? process.env.OWNER_EMAIL || process.env.OWNER_PHONE || input.recipient
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
  if (!configured || !data) return data;

  try {
    if (input.channel === 'email') {
      const result = await sendBrevoEmail(recipient, input.subject || 'BP Auto Repair', input.body);
      await admin
        .from('notification_events')
        .update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.messageId ?? null })
        .eq('id', data.id);
    } else if (input.channel === 'sms') {
      const result = await sendTwilioSms(recipient, input.body);
      await admin
        .from('notification_events')
        .update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.sid ?? null })
        .eq('id', data.id);
    } else if (input.channel === 'owner_alert' && process.env.OWNER_EMAIL && emailConfigured()) {
      const result = await sendBrevoEmail(recipient, input.subject || 'New BP Auto Repair alert', input.body);
      await admin
        .from('notification_events')
        .update({ status: 'sent', sent_at: new Date().toISOString(), provider: 'brevo', provider_message_id: result.messageId ?? null })
        .eq('id', data.id);
    } else if (input.channel === 'owner_alert' && process.env.OWNER_PHONE && smsConfigured()) {
      const result = await sendTwilioSms(recipient, input.body);
      await admin
        .from('notification_events')
        .update({ status: 'sent', sent_at: new Date().toISOString(), provider: 'twilio', provider_message_id: result.sid ?? null })
        .eq('id', data.id);
    }
  } catch (error) {
    await admin
      .from('notification_events')
      .update({ status: 'failed', error: error instanceof Error ? error.message : 'Unknown notification failure' })
      .eq('id', data.id);
  }

  return data;
}
