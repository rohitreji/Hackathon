-- Add default value to updatedAt column to prevent null constraint violations
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;