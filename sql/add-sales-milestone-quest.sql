-- Migration: Add sales_milestone quest type
-- 1. Add sales_target column to rep_quests
-- 2. Update quest_type CHECK constraint to include 'sales_milestone'

-- Add sales_target column (only used for sales_milestone quests)
ALTER TABLE rep_quests
ADD COLUMN IF NOT EXISTS sales_target INTEGER;

-- Drop the existing CHECK constraint on quest_type and recreate with sales_milestone
ALTER TABLE rep_quests
DROP CONSTRAINT IF EXISTS rep_quests_quest_type_check;

ALTER TABLE rep_quests
ADD CONSTRAINT rep_quests_quest_type_check
CHECK (quest_type IN ('social_post', 'story_share', 'content_creation', 'custom', 'sales_milestone'));
