import { NextResponse } from 'next/server';
import { getCurrentStaff } from '@/lib/auth';
import { updateQueueItem } from '@/lib/shop';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (staff.profile?.role !== 'owner') return NextResponse.json({ error: 'Owner access required' }, { status: 403 });

  try {
    const { id } = await params;
    const item = await updateQueueItem(id, await request.json());
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update queue item' }, { status: 500 });
  }
}
