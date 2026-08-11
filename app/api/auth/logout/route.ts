import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/app/lib/supabase/server';
import { errorResponse } from '@/app/lib/api/errors';

export async function POST() {
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
