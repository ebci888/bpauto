import { NextResponse } from 'next/server';
import { getAvailableSlots } from '@/lib/shop';

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year'));
  const month = Number(searchParams.get('month'));

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid month' }, { status: 400 });
  }

  try {
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = await Promise.all(
      Array.from({ length: daysInMonth }, async (_, index) => {
        const date = dateKey(year, month, index + 1);
        const slots = await getAvailableSlots(date);
        return { date, slotCount: slots.length };
      })
    );

    return NextResponse.json({ year, month, days });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load month availability' }, { status: 500 });
  }
}
