import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type AssistantMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const assistantInstructions = `
You are the BP Auto Repair website assistant for a Surrey, BC auto and diesel repair shop.
Keep replies warm, concise, and useful for a customer on a phone.
Your goals:
- Answer basic questions about services, hours, location, and booking.
- Ask one or two helpful intake questions when the customer describes a vehicle problem.
- Encourage booking through the page form or calling 604-590-2788 for urgent/safety issues.
- Do not claim a confirmed appointment. Say booking requests are reviewed by the shop.
- Do not diagnose with certainty or quote exact repair prices.

Shop facts:
- BP Auto Repair is at Unit 218, 13308 76 Ave, Surrey, BC V3W 2W1.
- Phone: 604-590-2788.
- Hours: Monday-Friday 8:00 AM-6:00 PM, Saturday 9:00 AM-4:00 PM, Sunday closed.
- Services: diesel engine repair, engine diagnostics, brakes, oil and fluid service, suspension and steering, electrical repair, transmission service, and general inspection.
- Booking flow: customer submits a request; the owner confirms or adjusts the time.
`;

function cleanMessage(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 1200) : '';
}

function fallbackReply(message: string) {
  const text = message.toLowerCase();
  if (text.includes('hour') || text.includes('open') || text.includes('close')) {
    return 'We are open Monday to Friday 8 AM to 6 PM, Saturday 9 AM to 4 PM, and closed Sunday. Want help choosing a booking time?';
  }
  if (text.includes('where') || text.includes('address') || text.includes('location')) {
    return 'BP Auto Repair is at Unit 218, 13308 76 Ave in Surrey, BC. You can book online here or call 604-590-2788.';
  }
  if (text.includes('brake') || text.includes('noise') || text.includes('check engine') || text.includes('oil') || text.includes('diesel')) {
    return 'I can help start the intake. What vehicle is it, and when did the issue start? If it feels unsafe to drive, please call the shop at 604-590-2788.';
  }
  if (text.includes('book') || text.includes('appointment')) {
    return 'Sure. Use the booking form on this page to request a time. The shop will review it and confirm or adjust the appointment.';
  }
  return 'I can help with booking, services, hours, and basic intake questions. What vehicle are you bringing in, and what seems to be going on?';
}

function transcript(messages: AssistantMessage[], message: string) {
  return [
    ...messages.slice(-8).map((item) => `${item.role === 'user' ? 'Customer' : 'Assistant'}: ${item.content}`),
    `Customer: ${message}`
  ].join('\n');
}

async function askGemini(message: string, messages: AssistantMessage[]) {
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
      contents: [
        {
          parts: [
            {
              text: `${assistantInstructions}\n\nConversation:\n${transcript(messages, message)}\n\nAssistant:`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.45,
        maxOutputTokens: 180
      }
    })
  });

  if (!response.ok) throw new Error(`Gemini assistant failed with ${response.status}`);
  const result = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return result.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || null;
}

async function askOpenAI(message: string, messages: AssistantMessage[]) {
  if (!process.env.OPENAI_API_KEY) return null;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.5',
      instructions: assistantInstructions,
      input: [
        ...messages.slice(-8).map((item) => ({
          role: item.role,
          content: item.content
        })),
        { role: 'user', content: message }
      ],
      max_output_tokens: 180
    })
  });

  if (!response.ok) throw new Error(`OpenAI assistant failed with ${response.status}`);
  const result = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  return result.output_text || result.output?.flatMap((item) => item.content || []).map((item) => item.text || '').join('').trim() || null;
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { message?: unknown; messages?: unknown };
  const message = cleanMessage(payload.message);
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

  try {
    const geminiReply = await askGemini(message, messages);
    if (geminiReply) return NextResponse.json({ reply: geminiReply, provider: 'gemini' });
  } catch (error) {
    console.warn(error);
  }

  try {
    const openAiReply = await askOpenAI(message, messages);
    if (openAiReply) return NextResponse.json({ reply: openAiReply, provider: 'openai' });
  } catch (error) {
    console.warn(error);
  }

  return NextResponse.json({ reply: fallbackReply(message), provider: 'demo' });
}
