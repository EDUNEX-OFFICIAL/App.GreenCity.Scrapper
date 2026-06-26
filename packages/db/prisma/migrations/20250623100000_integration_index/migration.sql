-- Add composite index for integration API delta sync queries
CREATE INDEX IF NOT EXISTS "RawModuleRow_moduleKey_lastSeenAt_idx" ON "ingest"."RawModuleRow"("moduleKey", "lastSeenAt");
