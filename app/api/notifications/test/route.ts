import { NextResponse } from 'next/server';
import { getCurrentStaff } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

type TestChannel = 'email' | 'sms';

function isTestChannel(value: unknown): value is TestChannel {
  return value === 'email' || value === 'sms';
}

export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (staff.profile?.role !== 'owner') return NextResponse.json({ error: 'Owner access required' }, { status: 403 });

  const payload = (await request.json().catch(() => ({}))) as { channel?: unknown };
  if (!isTestChannel(payload.channel)) {
    return NextResponse.json({ error: 'Choose email or SMS.' }, { status: 400 });
  }

  const now = new Date().toLocaleString('en-CA', {
    timeZone: 'America/Vancouver',
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  try {
    if (payload.channel === 'email') {
      if (!process.env.OWNER_EMAIL) return NextResponse.json({ error: 'OWNER_EMAIL is required for test email.' }, { status: 400 });

      const event = await createNotification({
        channel: 'email',
        eventType: 'owner_test_email',
        recipient: process.env.OWNER_EMAIL,
        subject: 'BP Auto Repair test email',
        body: `This is a BP Auto Repair OS test email sent from the dashboard at ${now}.`
      });

      return NextResponse.json({ event });
    }

    if (!process.env.OWNER_PHONE) return NextResponse.json({ error: 'OWNER_PHONE is required for test SMS.' }, { status: 400 });

    const event = await createNotification({
      channel: 'sms',
      eventType: 'owner_test_sms',
      recipient: process.env.OWNER_PHONE,
      body: `BP Auto Repair OS test SMS from the dashboard at ${now}.`
    });

    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not send test notification.' }, { status: 500 });
  }
}
