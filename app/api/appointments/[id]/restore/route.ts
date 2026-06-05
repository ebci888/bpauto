import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getCurrentStaff } from '@/lib/auth';
import { restoreAppointment } from '@/lib/shop';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (staff.profile?.role !== 'owner') return NextResponse.json({ error: 'Owner access required' }, { status: 403 });

  try {
    const { id } = await params;
    const appointment = await restoreAppointment(id, await request.json());
    return NextResponse.json({ appointment });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid appointment details', issues: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Could not restore appointment';
    return NextResponse.json({ error: message }, { status: message.includes('already confirmed') ? 409 : 500 });
  }
}
