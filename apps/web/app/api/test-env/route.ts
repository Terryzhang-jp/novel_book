import { NextResponse } from 'next/server';

export async function GET() {
  const envVars = {
    JWT_SECRET: process.env.JWT_SECRET ? `Set (${process.env.JWT_SECRET.substring(0, 10)}...)` : 'NOT SET',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? `Set (${process.env.NEXT_PUBLIC_SUPABASE_URL})` : 'NOT SET',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? `Set (${process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 20)}...)` : 'NOT SET',
    NODE_ENV: process.env.NODE_ENV,
  };

  return NextResponse.json({
    message: 'Environment variables check',
    env: envVars,
    allEnvKeys: Object.keys(process.env).filter(k =>
      k.includes('SUPABASE') || k.includes('JWT') || k.includes('VERCEL')
    ),
  });
}
