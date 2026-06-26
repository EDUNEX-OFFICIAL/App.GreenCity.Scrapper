-- GenealogyNode: key by uid + treeType (supports duplicate bpCode across UIDs)

-- Backfill uid from scrape run metadata
UPDATE ingest."GenealogyNode" gn
SET uid = sr.metadata->>'uid'
FROM ingest."ScrapeRun" sr
WHERE gn."scrapeRunId" = sr.id
  AND (gn.uid IS NULL OR gn.uid = '')
  AND COALESCE(sr.metadata->>'uid', '') <> '';

-- Fallback: match bp_list row by bpCode (latest seen)
UPDATE ingest."GenealogyNode" gn
SET uid = sub.uid
FROM (
  SELECT DISTINCT ON (LOWER(r."rowJson"->>'BP ID'))
    LOWER(r."rowJson"->>'BP ID') AS bp_key,
    r."rowJson"->>'UID' AS uid
  FROM ingest."RawModuleRow" r
  WHERE r."moduleKey" = 'bp_list'
    AND r."scrapeStatus" = 'ok'
    AND COALESCE(r."rowJson"->>'UID', '') <> ''
  ORDER BY LOWER(r."rowJson"->>'BP ID'), r."lastSeenAt" DESC
) sub
WHERE (gn.uid IS NULL OR gn.uid = '')
  AND LOWER(gn."bpCode") = sub.bp_key;

-- Last resort: synthetic uid so NOT NULL + unique constraint can apply
UPDATE ingest."GenealogyNode"
SET uid = 'legacy-' || id
WHERE uid IS NULL OR uid = '';

ALTER TABLE ingest."GenealogyNode" ALTER COLUMN uid SET NOT NULL;

DROP INDEX IF EXISTS ingest."GenealogyNode_bpCode_treeType_key";

CREATE UNIQUE INDEX "GenealogyNode_uid_treeType_key" ON ingest."GenealogyNode"("uid", "treeType");

CREATE INDEX IF NOT EXISTS "GenealogyNode_bpCode_idx" ON ingest."GenealogyNode"("bpCode");
