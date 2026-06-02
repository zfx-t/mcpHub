export interface ServerConfig {
  host: string;
  port: number;
  publicBaseUrl: string;
  mcpServerUrl: string;
  databaseUrl?: string;
  fetchTimeoutMs: number;
  fetchRateLimitPerMinute: number;
  requestLogging: boolean;
  sampleAdminApiBaseUrl?: string;
  sampleAdminApiTokenEnv: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const publicBaseUrl = env.PUBLIC_BASE_URL ?? "http://localhost:3000";
  return {
    host: env.HOST ?? "0.0.0.0",
    port: Number(env.PORT ?? 3000),
    publicBaseUrl,
    mcpServerUrl: env.MCP_SERVER_URL ?? `${publicBaseUrl}/mcp`,
    databaseUrl: env.DATABASE_URL,
    fetchTimeoutMs: Number(env.FETCH_TIMEOUT_MS ?? 10000),
    fetchRateLimitPerMinute: Number(env.FETCH_RATE_LIMIT_PER_MINUTE ?? 60),
    requestLogging: env.REQUEST_LOGGING !== "false",
    sampleAdminApiBaseUrl: env.SAMPLE_ADMIN_API_BASE_URL,
    sampleAdminApiTokenEnv: env.SAMPLE_ADMIN_API_TOKEN_ENV ?? "SAMPLE_ADMIN_API_TOKEN"
  };
}
