import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getCurrentStaff } from '@/lib/auth';
import { createQuickCapture } from '@/lib/shop';

export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const item = await createQuickCapture(await request.json());
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid quick capture', issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save quick capture' }, { status: 500 });
  }
}
