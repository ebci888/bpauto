import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getCurrentStaff } from '@/lib/auth';
import { cancelAppointment, rescheduleAppointment } from '@/lib/shop';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (staff.profile?.role !== 'owner') return NextResponse.json({ error: 'Owner access required' }, { status: 403 });

  try {
    const { id } = await params;
    const appointment = await rescheduleAppointment(id, await request.json());
    return NextResponse.json({ appointment });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid appointment details', issues: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Could not reschedule appointment';
    return NextResponse.json({ error: message }, { status: message.includes('already confirmed') ? 409 : 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (staff.profile?.role !== 'owner') return NextResponse.json({ error: 'Owner access required' }, { status: 403 });

  try {
    const { id } = await params;
    const appointment = await cancelAppointment(id);
    return NextResponse.json({ appointment });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not delete appointment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
