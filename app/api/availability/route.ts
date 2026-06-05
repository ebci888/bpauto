import { NextResponse } from 'next/server';
import { getAvailableSlots } from '@/lib/shop';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || '';

  try {
    const slots = await getAvailableSlots(date);
    return NextResponse.json({ date, slots });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load availability' }, { status: 500 });
  }
}
