import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getCurrentStaff } from '@/lib/auth';
import { createBlockedTime } from '@/lib/shop';

export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (staff.profile?.role !== 'owner') return NextResponse.json({ error: 'Owner access required' }, { status: 403 });

  try {
    const block = await createBlockedTime(await request.json(), staff.user.id);
    return NextResponse.json({ block }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid blocked time', issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not block time' }, { status: 500 });
  }
}
