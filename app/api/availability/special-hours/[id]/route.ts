import { NextResponse } from 'next/server';
import { getCurrentStaff } from '@/lib/auth';
import { deleteSpecialHour } from '@/lib/shop';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (staff.profile?.role !== 'owner') return NextResponse.json({ error: 'Owner access required' }, { status: 403 });

  try {
    const { id } = await params;
    await deleteSpecialHour(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not remove special hours' }, { status: 500 });
  }
}
