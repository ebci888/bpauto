import { NextResponse } from 'next/server';
import { getDashboardData } from '@/lib/shop';
import { getCurrentStaff } from '@/lib/auth';

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    return NextResponse.json(await getDashboardData());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load dashboard' }, { status: 500 });
  }
}
