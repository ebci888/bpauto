import { NextResponse } from 'next/server';
import { getCurrentStaff } from '@/lib/auth';

export async function POST() {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  return NextResponse.json({
    suggestions: null,
    message: 'AI parsing hook is ready. Connect an AI parser here when enabled.'
  });
}
