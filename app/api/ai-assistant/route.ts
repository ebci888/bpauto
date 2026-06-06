import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getAvailableSlots } from '@/lib/shop';
import { clean } from '@/lib/text';

export const dynamic = 'force-dynamic';

type AssistantMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type BookingDraft = {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  vehicle?: string;
  service?: string;
  notes?: string;
  preferred_date?: string;
  preferred_time?: string;
  urgency?: 'routine' | 'soon' | 'urgent' | 'unsafe';
  safety_note?: string;
};

type AssistantPayload = {
  reply: string;
  booking_intent: boolean;
  booking_draft: BookingDraft;
  missing_fields: string[];
  summary: string;
  urgency: BookingDraft['urgency'];
  should_show_booking_form: boolean;
};

const defaultAssistantPayload: AssistantPayload = {
  reply:
    'Hi, thanks for reaching out to BP Auto Repair. I can help with service questions, basic intake, and booking a request. What vehicle are we looking at, and what is going on?',
  booking_intent: false,
  booking_draft: {},
  missing_fields: [],
  summary: '',
  urgency: 'routine',
  should_show_booking_form: false
};

function currentShopDateKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function assistantInstructions() {
  return `
You are Ava, a calm, friendly female service-advisor style AI assistant for BP Auto Repair in Surrey, BC.
You are not a mechanic replacing inspection. You are an intake advisor who asks smart questions, gives cautious likely categories, and helps customers book.

Speak naturally, briefly, and professionally. Sound helpful, not robotic.
Detect the customer's language. Reply in Hindi if they speak Hindi, Punjabi if they speak Punjabi, English if they speak English, and a natural mixed style if they use Hinglish or Punjabi-English.

Shop facts:
- Business: BP Auto Repair, Surrey, BC.
- Address: Unit 218, 13308 76 Ave, Surrey, BC V3W 2W1.
- Phone: 604-590-2788.
- Hours: Monday-Friday 8:00 AM-6:00 PM, Saturday 9:00 AM-4:00 PM, Sunday closed.
- Current date in Surrey, BC: ${currentShopDateKey()}.
- Services: diesel engine repair, engine diagnostics, check engine light, brakes, oil and fluid service, suspension and steering, electrical/no-start, battery/charging, transmission service, general inspection, fleet and truck work.
- Booking flow: customers submit a request; the owner confirms or adjusts the time.
- Never say an appointment is confirmed, booked, or that you will confirm it yourself. Say it is a request until the shop owner confirms.

Local safety/intake behavior:
- Always return booking_draft fields, missing_fields, summary, urgency, and safety_note in English for the dashboard, SMS, and owner workflow, even when the customer-facing reply is Hindi or Punjabi.
- Translate service/symptom notes into concise English. Keep customer names exactly as spoken/spelled by the customer. Keep phone numbers as digits. Normalize preferred_date to YYYY-MM-DD and preferred_time to a human English time like "9:00 AM".
- For no-start: ask if lights come on, if it clicks/cranks, battery age, and whether it is safe/accessible for tow.
- For weird driving noise: ask when it happens, speed/braking/turning, location of noise, warning lights, and vehicle details.
- For brake symptoms, steering issues, smoke, overheating, fuel smell, severe vibration, or the vehicle not staying running: recommend not driving if unsafe and call the shop or arrange towing.
- You may say it could be a category like battery, starter, alternator, brake wear, wheel bearing, suspension, or charging issue, but never diagnose with certainty or quote exact repair prices.
- If a customer wants booking, collect name, phone, email if available, vehicle, service/symptom, preferred date/time, and notes.
- For names and emails, use the letters from the customer's latest correction exactly. If spelling is still uncertain, ask the customer to type it.
- Convert relative dates such as today, tomorrow, next Monday, or this weekend using the current Surrey date above.
- Do not return a date before the current Surrey date.
- If the customer says morning, afternoon, or evening without an exact time, leave preferred_time blank and ask them to choose a time.
- Use human time strings like "9:00 AM" for preferred_time.

Return ONLY compact JSON with this exact shape:
{
  "reply": "customer-facing answer",
  "booking_intent": true,
  "booking_draft": {
    "first_name": "",
    "last_name": "",
    "phone": "",
    "email": "",
    "vehicle": "",
    "service": "",
    "notes": "",
    "preferred_date": "",
    "preferred_time": "",
    "urgency": "routine|soon|urgent|unsafe",
    "safety_note": ""
  },
  "missing_fields": ["phone", "vehicle", "preferred_date"],
  "summary": "short internal summary",
  "urgency": "routine|soon|urgent|unsafe",
  "should_show_booking_form": true
}
`;
}

function cleanMessage(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 1400) : '';
}

function mergeDraft(...drafts: Array<BookingDraft | undefined>) {
  return drafts.reduce<BookingDraft>((merged, draft) => {
    if (!draft) return merged;
    for (const [key, value] of Object.entries(draft) as Array<[keyof BookingDraft, string | undefined]>) {
      if (clean(value)) merged[key] = clean(value) as never;
    }
    return merged;
  }, {});
}

function normalizeTime(value: string | undefined) {
  const trimmed = clean(value);
  if (!trimmed) return undefined;
  if (/morning|afternoon|evening|anytime|after lunch|before lunch/i.test(trimmed)) return undefined;

  const twentyFourHour = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1]);
    const minute = twentyFourHour[2];
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minute} ${suffix}`;
  }

  const twelveHour = trimmed.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    if (hour < 1 || hour > 12) return undefined;
    return `${hour}:${twelveHour[2] || '00'} ${twelveHour[3].toUpperCase()}`;
  }

  return trimmed.slice(0, 40);
}

function normalizeDraft(draft: BookingDraft) {
  const normalized: BookingDraft = { ...draft };
  const today = currentShopDateKey();

  if (normalized.preferred_date && !/^\d{4}-\d{2}-\d{2}$/.test(normalized.preferred_date)) {
    normalized.preferred_date = undefined;
  }
  if (normalized.preferred_date && normalized.preferred_date < today) {
    normalized.preferred_date = undefined;
  }

  normalized.preferred_time = normalizeTime(normalized.preferred_time);
  if (normalized.urgency && !['routine', 'soon', 'urgent', 'unsafe'].includes(normalized.urgency)) {
    normalized.urgency = 'routine';
  }

  return normalized;
}

function missingFields(draft: BookingDraft) {
  const missing: string[] = [];
  if (!draft.first_name || !draft.last_name) missing.push('full name');
  if (!draft.phone) missing.push('phone');
  if (!draft.email) missing.push('email');
  if (!draft.vehicle) missing.push('vehicle');
  if (!draft.service && !draft.notes) missing.push('service or symptom');
  if (!draft.preferred_date) missing.push('preferred date');
  if (!draft.preferred_time) missing.push('preferred time');
  return missing;
}

function availabilityText(date: string, slots: string[]) {
  if (!slots.length) return `I checked ${date}, and there are no open request times left for that day. We can choose another day, or you can call the shop if this is urgent.`;
  const preview = slots.slice(0, 6).join(', ');
  return `Open request times for ${date} include ${preview}${slots.length > 6 ? ', and more' : ''}. Which time works best?`;
}

async function applyAvailabilityCheck(draft: BookingDraft, reply: string) {
  if (!draft.preferred_date) return { draft, reply };

  const slots = await getAvailableSlots(draft.preferred_date);
  if (!draft.preferred_time) return { draft, reply };

  if (slots.includes(draft.preferred_time)) {
    return {
      draft,
      reply: `${reply} ${draft.preferred_time} on ${draft.preferred_date} is currently open as a request slot.`
    };
  }

  const unavailableTime = draft.preferred_time;
  return {
    draft: { ...draft, preferred_time: undefined },
    reply: `I checked the schedule, and ${unavailableTime} on ${draft.preferred_date} is not available. ${availabilityText(draft.preferred_date, slots)}`
  };
}

function transcript(messages: AssistantMessage[], message: string, draft: BookingDraft) {
  const priorDraft = Object.keys(draft).length ? `Known booking draft: ${JSON.stringify(draft)}\n` : '';
  return `${priorDraft}${[
    ...messages.slice(-10).map((item) => `${item.role === 'user' ? 'Customer' : 'Assistant'}: ${item.content}`),
    `Customer: ${message}`
  ].join('\n')}`;
}

function extractLocalDraft(message: string): BookingDraft {
  const draft: BookingDraft = {};
  const text = message.trim();
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = text.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/)?.[0];
  if (email) draft.email = email;
  if (phone) draft.phone = phone;

  const vehicle = text.match(/\b(?:\d{4}\s+)?(?:honda|toyota|ford|chevy|chevrolet|dodge|ram|gmc|bmw|mercedes|audi|volkswagen|vw|nissan|hyundai|kia|mazda|subaru|jeep|tesla|freightliner|kenworth|peterbilt)\s+[\w -]{2,35}/i)?.[0];
  if (vehicle) draft.vehicle = vehicle;

  const lower = text.toLowerCase();
  if (lower.includes('brake')) draft.service = 'Brake inspection';
  else if (lower.includes('oil')) draft.service = 'Oil and fluid service';
  else if (lower.includes('check engine')) draft.service = 'Engine diagnostics';
  else if (lower.includes('not starting') || lower.includes('no start') || lower.includes('click')) draft.service = 'No-start electrical diagnostic';
  else if (lower.includes('noise') || lower.includes('sound')) draft.service = 'Noise inspection';
  else if (lower.includes('diesel')) draft.service = 'Diesel repair';

  if (lower.includes('not starting') || lower.includes('tow') || lower.includes('unsafe') || lower.includes('smoke') || lower.includes('overheat')) {
    draft.urgency = 'urgent';
    draft.safety_note = 'If the vehicle feels unsafe, do not drive it. Call the shop or arrange towing.';
  }

  draft.notes = text;
  return draft;
}

function fallbackPayload(message: string, currentDraft: BookingDraft): AssistantPayload {
  const text = message.toLowerCase();
  const draft = mergeDraft(currentDraft, extractLocalDraft(message));
  let reply = 'I can help with that. What vehicle is it, and what symptoms are you noticing?';
  let urgency: BookingDraft['urgency'] = draft.urgency || 'routine';

  if (text.includes('not starting') || text.includes('no start') || text.includes('click')) {
    urgency = 'urgent';
    reply =
      'That sounds like a no-start issue. It could be battery, starter, alternator, or wiring related, but we would need to inspect it. Do the lights come on, and does it click or crank? If it cannot be moved safely, call 604-590-2788 and we can talk through towing options.';
  } else if (text.includes('noise') || text.includes('sound')) {
    reply =
      'A driving noise can come from brakes, wheel bearings, tires, suspension, or driveline parts depending on when it happens. Does it happen while braking, turning, accelerating, or at a certain speed?';
  } else if (text.includes('book') || text.includes('appointment')) {
    reply = 'Absolutely. I can help draft the booking request. What is your name, phone number, vehicle, and preferred day or time?';
  } else if (text.includes('where') || text.includes('location')) {
    reply = 'BP Auto Repair is at Unit 218, 13308 76 Ave in Surrey, BC. You can book online here or call 604-590-2788.';
  }

  const missing = missingFields(draft);
  return {
    reply,
    booking_intent: text.includes('book') || text.includes('appointment') || missing.length < 5,
    booking_draft: draft,
    missing_fields: missing,
    summary: draft.notes || message,
    urgency,
    should_show_booking_form: missing.length <= 4
  };
}

function parseJsonPayload(text: string): AssistantPayload | null {
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<AssistantPayload>;
    return {
      ...defaultAssistantPayload,
      ...parsed,
      booking_draft: parsed.booking_draft || {},
      missing_fields: Array.isArray(parsed.missing_fields) ? parsed.missing_fields : []
    };
  } catch {
    return null;
  }
}

async function askOpenAI(message: string, messages: AssistantMessage[], draft: BookingDraft) {
  if (!process.env.OPENAI_API_KEY) return null;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      instructions: assistantInstructions(),
      input: transcript(messages, message, draft),
      max_output_tokens: 420,
      temperature: 0.35
    })
  });

  if (!response.ok) throw new Error(`OpenAI assistant failed with ${response.status}`);
  const result = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const text = result.output_text || result.output?.flatMap((item) => item.content || []).map((item) => item.text || '').join('').trim() || '';
  return parseJsonPayload(text);
}

async function askGemini(message: string, messages: AssistantMessage[], draft: BookingDraft) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${assistantInstructions()}\n\n${transcript(messages, message, draft)}` }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 420
      }
    })
  });

  if (!response.ok) throw new Error(`Gemini assistant failed with ${response.status}`);
  const result = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '';
  return parseJsonPayload(text);
}

async function persistTurn(input: {
  conversationId?: string | null;
  provider: string;
  userMessage: string;
  assistantReply: string;
  summary: string;
  bookingDraft: BookingDraft;
  bookingReady: boolean;
}) {
  const admin = getSupabaseAdmin();
  const conversationPayload = {
    provider: input.provider,
    latest_summary: input.summary || null,
    booking_draft: input.bookingDraft,
    status: input.bookingReady ? 'booking_ready' : 'active'
  };

  const conversation = input.conversationId
    ? await admin
        .from('ai_assistant_conversations')
        .update(conversationPayload)
        .eq('id', input.conversationId)
        .select('id')
        .maybeSingle()
    : await admin.from('ai_assistant_conversations').insert(conversationPayload).select('id').single();

  if (conversation.error) throw conversation.error;
  const conversationId = conversation.data?.id || input.conversationId;
  if (!conversationId) throw new Error('Could not create assistant conversation.');

  const { error: messageError } = await admin.from('ai_assistant_messages').insert([
    { conversation_id: conversationId, role: 'user', content: input.userMessage },
    { conversation_id: conversationId, role: 'assistant', content: input.assistantReply, provider: input.provider }
  ]);
  if (messageError) throw messageError;

  return conversationId;
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as {
    message?: unknown;
    messages?: unknown;
    conversationId?: unknown;
    bookingDraft?: unknown;
  };
  const message = cleanMessage(payload.message);
  const currentDraft = typeof payload.bookingDraft === 'object' && payload.bookingDraft ? (payload.bookingDraft as BookingDraft) : {};
  const messages = Array.isArray(payload.messages)
    ? payload.messages
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const role = 'role' in item && item.role === 'assistant' ? 'assistant' : 'user';
          const content = cleanMessage('content' in item ? item.content : '');
          return content ? { role, content } : null;
        })
        .filter((item): item is AssistantMessage => Boolean(item))
    : [];

  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });

  let provider = 'demo';
  let result: AssistantPayload | null = null;

  try {
    result = await askOpenAI(message, messages, currentDraft);
    if (result) provider = 'openai';
  } catch (error) {
    console.warn(error);
  }

  if (!result) {
    try {
      result = await askGemini(message, messages, currentDraft);
      if (result) provider = 'gemini';
    } catch (error) {
      console.warn(error);
    }
  }

  if (!result) result = fallbackPayload(message, currentDraft);

  const initialBookingDraft = normalizeDraft(mergeDraft(currentDraft, result.booking_draft));
  const availabilityChecked = await applyAvailabilityCheck(initialBookingDraft, result.reply);
  const bookingDraft = availabilityChecked.draft;
  const missing = missingFields(bookingDraft);
  const responsePayload: AssistantPayload = {
    ...defaultAssistantPayload,
    ...result,
    reply: availabilityChecked.reply,
    booking_draft: bookingDraft,
    missing_fields: missing,
    urgency: result.urgency || bookingDraft.urgency || 'routine',
    should_show_booking_form: result.should_show_booking_form || missing.length <= 4
  };

  let conversationId = typeof payload.conversationId === 'string' ? payload.conversationId : null;
  try {
    conversationId = await persistTurn({
      conversationId,
      provider,
      userMessage: message,
      assistantReply: responsePayload.reply,
      summary: responsePayload.summary,
      bookingDraft,
      bookingReady: missing.length === 0
    });
  } catch (error) {
    console.warn(error);
  }

  return NextResponse.json({
    ...responsePayload,
    provider,
    conversationId
  });
}
