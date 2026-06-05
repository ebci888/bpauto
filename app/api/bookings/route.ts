import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createWebsiteBooking } from '@/lib/shop';

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Could not create booking';
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await createWebsiteBooking(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid booking request', issues: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Could not create booking' : errorMessage(error) },
      { status: 500 }
    );
  }
}
