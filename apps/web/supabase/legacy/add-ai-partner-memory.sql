-- Migration: Add AI Partner Memory to documents table
-- Purpose: Store AI Writing Partner memory (user intent, content understanding, etc.)
-- Run this in Supabase SQL Editor

-- Step 1: Add ai_partner_memory column
ALTER TABLE documents ADD COLUMN IF NOT EXISTS 
  ai_partner_memory JSONB DEFAULT '{
    "userIntent": {
      "goal": null,
      "goalConfidence": 0,
      "goalConfirmedByUser": false,
      "genre": null,
      "themes": [],
      "outline": null,
      "targetWordCount": null,
      "deadline": null
    },
    "contentUnderstanding": {
      "documentSummary": "",
      "characters": [],
      "scenes": [],
      "currentChapter": null,
      "narrativeArc": null
    },
    "writingStyle": {
      "tone": "neutral",
      "pacing": "moderate",
      "vocabulary": "standard",
      "preferredSentenceLength": "mixed"
    },
    "conversationHistory": []
  }'::jsonb;

-- Step 2: Create GIN index for faster JSON queries
CREATE INDEX IF NOT EXISTS idx_documents_ai_partner_memory 
  ON documents USING GIN (ai_partner_memory);

-- Step 3: Add comment for documentation
COMMENT ON COLUMN documents.ai_partner_memory IS 
  'Stores AI Writing Partner state including user intent, content understanding, writing style, and conversation history';
