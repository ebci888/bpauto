import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createWebsiteBooking } from '@/lib/shop';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await createWebsiteBooking(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid booking request', issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create booking' }, { status: 500 });
  }
}
