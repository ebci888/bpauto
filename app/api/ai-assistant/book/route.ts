import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { BookingSpamBlockedError, createWebsiteBooking } from '@/lib/shop';
import { clean } from '@/lib/text';

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Could not create booking';
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { conversationId?: unknown; booking?: unknown; bookingDraft?: unknown };
    const result = await createWebsiteBooking(body.booking, {
      ip:
        request.headers.get('cf-connecting-ip') ||
        request.headers.get('x-nf-client-connection-ip') ||
        request.headers.get('x-forwarded-for')?.split(',')[0] ||
        null,
      userAgent: request.headers.get('user-agent')
    });

    const conversationId = typeof body.conversationId === 'string' ? clean(body.conversationId) : '';
    if (conversationId && result.booking?.id) {
      const admin = getSupabaseAdmin();
      const { error } = await admin
        .from('ai_assistant_conversations')
        .update({
          status: 'submitted',
          booking_request_id: result.booking.id,
          booking_draft: body.bookingDraft && typeof body.bookingDraft === 'object' ? body.bookingDraft : body.booking,
          latest_summary: `Booking request ${result.booking.reference} submitted from AI assistant.`
        })
        .eq('id', conversationId);
      if (error) console.warn(error);
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid booking request', issues: error.issues }, { status: 400 });
    }
    if (error instanceof BookingSpamBlockedError) {
      return NextResponse.json({ error: 'Could not send booking request. Please call the shop at 604-590-2788.' }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes('no longer available')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Could not create booking' : errorMessage(error) },
      { status: 500 }
    );
  }
}
