import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getCurrentStaff } from '@/lib/auth';
import { confirmBookingRequest } from '@/lib/shop';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const { id } = await params;
    const appointment = await confirmBookingRequest(id, await request.json());
    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid appointment details', issues: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Could not confirm appointment';
    return NextResponse.json({ error: message }, { status: message.includes('already confirmed') ? 409 : 500 });
  }
}
