import { NextResponse } from 'next/server';
import { getCurrentStaff } from '@/lib/auth';
import { getNotificationSetupStatus } from '@/lib/notifications';

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  return NextResponse.json(getNotificationSetupStatus());
}
