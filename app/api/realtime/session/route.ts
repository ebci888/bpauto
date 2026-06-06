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
- Detect the customer's language from what they say. If they speak Hindi, reply in Hindi. If they speak Punjabi, reply in Punjabi. If they mix Hindi/Punjabi and English, match that natural mixed style.
- Keep internal booking details in English for the dashboard and SMS: translate service/symptom notes into concise English, keep names as spoken/spelled, keep phone numbers as digits, keep dates as ISO-ready meaning, and keep times like "9:00 AM".
- If you are unsure whether the customer is speaking Hindi, Punjabi, or English, politely ask which language they prefer.
- If the customer describes an unsafe symptom, advise them not to drive if it feels unsafe and to call the shop or arrange towing.
- Do not diagnose with certainty. Use cautious language like "it could be" or "we should inspect it."
- If the customer wants an appointment, collect full name, phone, email, vehicle, service/symptom, preferred date, and preferred time.
- Repeat back names, phone numbers, and emails slowly and ask for correction when spelling may be unclear.
- For names and emails, use the letters from the customer's latest correction exactly. If the spelling is still uncertain, ask them to type it in the chat or booking form.
- Make clear that bookings are requests until the shop confirms.
- When you have full name, phone, email, vehicle, service/symptom, preferred date, and preferred time, repeat the summary briefly and ask exactly: "Should I send this booking request now?"
- If the customer clearly says yes after that question, say: "Great, I am sending the request now. I will show the request reference once it goes through."
- Do not say the booking is confirmed. It is only a request until the shop owner confirms or adjusts the time.
- Do not ask the customer to tap a button during voice unless the booking request cannot be sent.
- Keep replies short enough for a phone call.
`;

function normalizedOpenAiApiKey() {
  return (process.env.OPENAI_API_KEY || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^['"]|['"]$/g, '');
}

function parseOpenAiError(body: string) {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; code?: string; type?: string } };
    return parsed.error || null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const openAiApiKey = normalizedOpenAiApiKey();

  if (!openAiApiKey) {
    return NextResponse.json(
      {
        error: 'Live voice is not configured yet. Please use text chat or book online for now.',
        code: 'openai_key_missing'
      },
      { status: 500 }
    );
  }

  if (!openAiApiKey.startsWith('sk-')) {
    return NextResponse.json(
      {
        error: 'Live voice is not configured yet. Please use text chat or book online for now.',
        code: 'openai_key_invalid_shape'
      },
      { status: 500 }
    );
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
      model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime',
      instructions: realtimeInstructions,
      output_modalities: ['audio'],
      audio: {
        input: {
          transcription: {
            model: process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
            prompt:
              'Multilingual BP Auto Repair intake in Surrey, BC. English, Hindi, Punjabi, Hinglish, and Punjabi-English are possible. Auto repair terms: diesel repair, brakes, oil change, check engine light, no-start, battery, alternator, starter, towing, service appointment, Surrey, BP Auto Repair. Keep extracted booking fields in English.'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.65,
            prefix_padding_ms: 500,
            silence_duration_ms: 1200,
            create_response: true,
            interrupt_response: false
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
      Authorization: `Bearer ${openAiApiKey}`
    },
    body: formData
  });

  const answer = await response.text();
  if (!response.ok) {
    const upstreamError = parseOpenAiError(answer);
    const authFailure = response.status === 401 || upstreamError?.code === 'invalid_issuer' || upstreamError?.code === 'invalid_api_key';

    console.warn('OpenAI realtime session failed', {
      status: response.status,
      code: upstreamError?.code || null,
      type: upstreamError?.type || null
    });

    return NextResponse.json(
      {
        error: authFailure
          ? 'Live voice is not configured yet. Please use text chat or book online for now.'
          : 'Live voice could not start. Please use text chat or book online for now.',
        code: upstreamError?.code || 'openai_realtime_error',
        upstream_status: response.status
      },
      { status: authFailure ? 500 : response.status }
    );
  }

  return new Response(answer, {
    status: 201,
    headers: { 'Content-Type': 'application/sdp' }
  });
}
