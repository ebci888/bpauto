import { createHash } from 'node:crypto';
import { clean, normalizePhone } from '@/lib/text';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type SpamStatus = 'clean' | 'suspected' | 'blocked';

export type BookingSpamContext = {
  ip?: string | null;
  userAgent?: string | null;
};

type BookingSpamInput = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  vehicle: string;
  service: string;
  notes?: string;
  booking_started_at?: string;
  company?: string;
  website?: string;
  'cf-turnstile-response'?: string;
};

export type SpamAssessment = {
  status: SpamStatus;
  score: number;
  reasons: string[];
  ipHash: string | null;
  userAgentHash: string | null;
  emailHash: string | null;
  phoneHash: string | null;
  emailDomain: string | null;
  turnstileVerified: boolean;
};

const suspiciousTerms = [
  'backlink',
  'casino',
  'crypto',
  'directory listing',
  'guest post',
  'link building',
  'loan',
  'marketing agency',
  'rank your website',
  'seo',
  'telegram',
  'viagra',
  'whatsapp'
];

const disposableDomains = ['mailinator.', 'tempmail.', 'guerrillamail.', '10minutemail.', 'yopmail.', 'sharklasers.'];

function hashValue(value?: string | null) {
  const trimmed = clean(value).toLowerCase();
  if (!trimmed) return null;
  const salt = process.env.SPAM_HASH_SALT || process.env.NEXT_PUBLIC_SUPABASE_URL || 'bp-auto-repair-os';
  return createHash('sha256').update(`${salt}:${trimmed}`).digest('hex');
}

function add(score: { value: number; reasons: string[] }, points: number, reason: string) {
  score.value += points;
  score.reasons.push(reason);
}

function countLinks(value: string) {
  return (value.match(/https?:\/\/|www\./gi) ?? []).length;
}

async function verifyTurnstile(token: string, ip?: string | null) {
  if (!process.env.TURNSTILE_SECRET_KEY) return false;

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: token,
      ...(ip ? { remoteip: ip } : {})
    })
  });
  const result = (await response.json().catch(() => ({}))) as { success?: boolean };
  return Boolean(result.success);
}

async function recentSubmissionCount(column: 'ip_hash' | 'email_hash' | 'phone_hash', value: string | null, minutes: number) {
  if (!value) return 0;
  const admin = getSupabaseAdmin();
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from('booking_submission_events')
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
    .gte('created_at', since);
  if (error) throw error;
  return count ?? 0;
}

export async function assessBookingSpam(input: BookingSpamInput, context: BookingSpamContext = {}): Promise<SpamAssessment> {
  const score = { value: 0, reasons: [] as string[] };
  const email = clean(input.email).toLowerCase();
  const emailDomain = email.includes('@') ? email.split('@').pop() || null : null;
  const phoneHash = hashValue(normalizePhone(input.phone));
  const emailHash = hashValue(email);
  const ipHash = hashValue(context.ip);
  const userAgentHash = hashValue(context.userAgent);
  const combinedText = [
    input.first_name,
    input.last_name,
    input.email,
    input.vehicle,
    input.service,
    input.notes
  ]
    .map(clean)
    .join(' ')
    .toLowerCase();

  if (clean(input.company) || clean(input.website)) add(score, 100, 'Hidden spam field was filled.');

  const startedAt = Number(input.booking_started_at);
  if (!startedAt || Number.isNaN(startedAt)) {
    add(score, 20, 'Missing form timing signal.');
  } else {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs < 3000) add(score, 80, 'Form submitted too quickly.');
    if (elapsedMs > 1000 * 60 * 60 * 6) add(score, 15, 'Form timing signal is stale.');
  }

  const linkCount = countLinks(combinedText);
  if (linkCount > 0) add(score, linkCount > 1 ? 60 : 30, 'Message contains external links.');

  if (suspiciousTerms.some((term) => combinedText.includes(term))) add(score, 45, 'Message matches common spam wording.');
  if (/(.)\1{6,}/.test(combinedText)) add(score, 25, 'Message has repeated-character spam pattern.');
  if (emailDomain && disposableDomains.some((domain) => emailDomain.includes(domain))) add(score, 35, 'Email appears disposable.');
  if (normalizePhone(input.phone).length < 10) add(score, 25, 'Phone number is incomplete for a local booking.');
  if (clean(input.vehicle).length < 4) add(score, 20, 'Vehicle details are too thin.');

  const turnstileToken = clean(input['cf-turnstile-response']);
  let turnstileVerified = false;
  if (turnstileToken) {
    turnstileVerified = await verifyTurnstile(turnstileToken, context.ip);
    if (!turnstileVerified) add(score, 70, 'Turnstile verification failed.');
  } else if (process.env.TURNSTILE_REQUIRED === 'true') {
    add(score, 70, 'Turnstile token is required but missing.');
  }

  const [recentIp, recentEmail, recentPhone] = await Promise.all([
    recentSubmissionCount('ip_hash', ipHash, 30),
    recentSubmissionCount('email_hash', emailHash, 60),
    recentSubmissionCount('phone_hash', phoneHash, 60)
  ]);
  if (recentIp >= 3) add(score, 45, 'Too many recent submissions from this browser/network.');
  if (recentEmail >= 2) add(score, 35, 'Too many recent submissions from this email.');
  if (recentPhone >= 2) add(score, 35, 'Too many recent submissions from this phone.');

  const status = score.value >= 100 ? 'blocked' : score.value >= 45 ? 'suspected' : 'clean';

  return {
    status,
    score: score.value,
    reasons: score.reasons,
    ipHash,
    userAgentHash,
    emailHash,
    phoneHash,
    emailDomain,
    turnstileVerified
  };
}

export async function logBookingSubmission(assessment: SpamAssessment, bookingRequestId?: string | null) {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from('booking_submission_events').insert({
    booking_request_id: bookingRequestId ?? null,
    ip_hash: assessment.ipHash,
    user_agent_hash: assessment.userAgentHash,
    email_hash: assessment.emailHash,
    phone_hash: assessment.phoneHash,
    email_domain: assessment.emailDomain,
    spam_status: assessment.status,
    spam_score: assessment.score,
    spam_reasons: assessment.reasons
  });
  if (error) throw error;
}
