#!/bin/bash

# Vercel Deployment Script
# This script sets up environment variables and deploys to Vercel

set -e

echo "🚀 Starting Vercel deployment process..."
echo ""

# Read environment variables from .env.local
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local file not found"
    exit 1
fi

# Source environment variables
export $(cat .env.local | grep -v '^#' | xargs)

echo "📋 Setting up environment variables on Vercel..."
echo ""

# JWT Secret (generated)
JWT_SECRET="Fd2+b+5XzvehxlzIuASrzN0pE+w5WCmGlaAzlbolDQjGBaTooy+zeTAGAC4y0mWQ"

echo "Setting JWT_SECRET..."
echo "$JWT_SECRET" | vercel env add JWT_SECRET production

echo "Setting NEXT_PUBLIC_SUPABASE_URL..."
echo "$NEXT_PUBLIC_SUPABASE_URL" | vercel env add NEXT_PUBLIC_SUPABASE_URL production

echo "Setting SUPABASE_SERVICE_ROLE_KEY..."
echo "$SUPABASE_SERVICE_ROLE_KEY" | vercel env add SUPABASE_SERVICE_ROLE_KEY production

# Optional: OpenAI API Key
if [ ! -z "$OPENAI_API_KEY" ]; then
    echo "Setting OPENAI_API_KEY..."
    echo "$OPENAI_API_KEY" | vercel env add OPENAI_API_KEY production
fi

echo ""
echo "✅ Environment variables configured!"
echo ""
echo "🚀 Starting deployment..."
echo ""

# Deploy to production
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Visit your Vercel dashboard to get the deployment URL"
echo "2. Test the login with one of the test users"
echo "3. Verify password change functionality works"
echo ""
echo "🔑 Test Users (password: Qazxsw123):"
echo "   - liboxian1016@gmail.com"
echo "   - linereus39@mail.com"
echo "   - antinoise1222@gmail.com"
echo "   - zoeweiyi61@gmail.com"
echo "   - fuukagei@gmail.com"
