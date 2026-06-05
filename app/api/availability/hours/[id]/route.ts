import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getCurrentStaff } from '@/lib/auth';
import { updateShopHour } from '@/lib/shop';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (staff.profile?.role !== 'owner') return NextResponse.json({ error: 'Owner access required' }, { status: 403 });

  try {
    const { id } = await params;
    const shopHour = await updateShopHour(id, await request.json());
    return NextResponse.json({ shopHour });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid shop hours', issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update shop hours' }, { status: 500 });
  }
}
