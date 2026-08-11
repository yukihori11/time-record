import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/app/lib/supabase/server';
import { errorResponse } from '@/app/lib/api/errors';
import { withLogging } from '@/app/lib/api/handler';

export const POST = withLogging('auth.logout.post', async () => {
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
