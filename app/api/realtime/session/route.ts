import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const realtimeInstructions = `
You are Ava, BP Auto Repair's live voice receptionist for customers in Surrey, BC.
You sound natural, calm, warm, and concise.

Business facts:
- BP Auto Repair is at Unit 218, 13308 76 Ave, Surrey, BC V3W 2W1.
- Phone: 604-590-2788.
- Hours: Monday-Friday 8:00 AM-6:00 PM, Saturday 9:00 AM-4:00 PM, Sunday closed.
- Services: diesel repair, diagnostics, brakes, oil and fluids, suspension, steering, electrical/no-start, transmission service, inspections, fleets, and trucks.

Conversation rules:
- Ask one question at a time.
- If the customer describes an unsafe symptom, advise them not to drive if it feels unsafe and to call the shop or arrange towing.
- Do not diagnose with certainty. Use cautious language like "it could be" or "we should inspect it."
- If the customer wants an appointment, collect full name, phone, email, vehicle, service/symptom, preferred date, and preferred time.
- Make clear that bookings are requests until the shop confirms.
- Keep replies short enough for a phone call.
`;

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not configured.' }, { status: 500 });
  }

  const sdp = await request.text();
  if (!sdp.trim()) {
    return NextResponse.json({ error: 'SDP offer is required.' }, { status: 400 });
  }

  const formData = new FormData();
  formData.set('sdp', sdp);
  formData.set(
    'session',
    JSON.stringify({
      type: 'realtime',
      model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2',
      instructions: realtimeInstructions,
      output_modalities: ['audio'],
      audio: {
        input: {
          transcription: {
            model: process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
            language: 'en',
            prompt: 'Auto repair, diesel repair, brakes, oil change, check engine light, no-start, Surrey, BP Auto Repair.'
          },
          turn_detection: {
            type: 'server_vad',
            prefix_padding_ms: 300,
            silence_duration_ms: 700
          }
        },
        output: {
          voice: process.env.OPENAI_REALTIME_VOICE || 'marin'
        }
      }
    })
  );

  const response = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: formData
  });

  const answer = await response.text();
  if (!response.ok) {
    return new Response(answer || 'Could not start realtime voice session.', {
      status: response.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  return new Response(answer, {
    status: 201,
    headers: { 'Content-Type': 'application/sdp' }
  });
}
