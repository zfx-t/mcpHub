CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  url_pattern TEXT NOT NULL,
  route_key TEXT,
  owner TEXT NOT NULL,
  visibility TEXT NOT NULL,
  refresh_policy JSONB NOT NULL,
  auth_requirement TEXT NOT NULL,
  risk_flags JSONB NOT NULL,
  health_status TEXT NOT NULL,
  last_successful_refresh_at TIMESTAMPTZ,
  last_error TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  backoff_until TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  version INTEGER NOT NULL,
  url_pattern TEXT NOT NULL,
  field_mappings JSONB NOT NULL,
  pagination_policy JSONB,
  cleaning_policy JSONB,
  sample_urls JSONB NOT NULL,
  confidence NUMERIC NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  content_text TEXT NOT NULL,
  content_html TEXT,
  summary TEXT,
  byline TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL,
  source_refs JSONB NOT NULL,
  confidence NUMERIC NOT NULL,
  extraction_warnings JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS feed_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  snippet TEXT NOT NULL,
  content_ref TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  tags JSONB NOT NULL,
  entities JSONB NOT NULL,
  readability_score NUMERIC,
  diff_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnostics (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
  rule_id TEXT REFERENCES rules(id) ON DELETE SET NULL,
  item_id TEXT REFERENCES feed_items(id) ON DELETE SET NULL,
  url TEXT,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  extraction_method TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  retryable BOOLEAN NOT NULL,
  suggested_next_action TEXT NOT NULL,
  details JSONB
);

CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS plugin_tools (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  input_schema JSONB NOT NULL,
  effect TEXT NOT NULL,
  requires_confirmation BOOLEAN NOT NULL,
  credential_refs JSONB NOT NULL,
  operation JSONB,
  enabled BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  requirement_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  secret_ref TEXT NOT NULL,
  scope TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_records (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL REFERENCES plugins(id),
  tool_name TEXT NOT NULL,
  effect TEXT NOT NULL,
  status TEXT NOT NULL,
  target TEXT,
  input_summary JSONB,
  status_code INTEGER,
  duration_ms NUMERIC,
  error_code TEXT,
  error_message TEXT,
  timestamp TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plugin_tools_plugin_id ON plugin_tools(plugin_id);
CREATE INDEX IF NOT EXISTS idx_credentials_plugin_id ON credentials(plugin_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_plugin_requirement ON credentials(plugin_id, requirement_id) WHERE requirement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_records_plugin_timestamp ON audit_records(plugin_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_records_tool_name ON audit_records(tool_name);
