import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithRateLimit, apiError } from '@/lib/auth';
import { sendOnboardingMessage } from '@/lib/services/anthropic';
import { z } from 'zod';

const schema = z.object({
  message: z.string().min(1).max(1000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
  langue: z.enum(['fr', 'es', 'en']).default('fr'),
});

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuthWithRateLimit(req, 10);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request body', 'VALIDATION_ERROR', 400);
  }

  console.log(
    `[onboarding/message] user=${userId.slice(0, 8)}… historyLen=${parsed.data.history.length} msgLen=${parsed.data.message.length}`
  );

  try {
    const result = await sendOnboardingMessage(
      parsed.data.history as Array<{ role: 'user' | 'assistant'; content: string }>,
      parsed.data.message as string,
      parsed.data.langue as string,
    );
    console.log(
      `[onboarding/message] OK — isComplete=${result.isComplete} responseLen=${result.response?.length ?? 0}`
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error('[onboarding/message] Anthropic error:', err);
    return apiError('AI service unavailable', 'AI_ERROR', 503);
  }
}
