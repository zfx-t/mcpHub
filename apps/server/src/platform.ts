import { AuditLogger } from "@mcphub/audit";
import { EnvironmentCredentialStore } from "@mcphub/credentials";
import type { McpHubRepository } from "@mcphub/db";
import type { PlatformGatewayOptions } from "@mcphub/mcp";
import { PluginRegistry, pluginRecordFromManifest, pluginToolsFromManifest, sampleAdminPlugin } from "@mcphub/plugins";
import type { ServerConfig } from "./config.js";

export interface PlatformServicesInput {
  repository: McpHubRepository;
  config: ServerConfig;
  env?: NodeJS.ProcessEnv;
}

export async function createPlatformServices(input: PlatformServicesInput): Promise<PlatformGatewayOptions | undefined> {
  if (!input.config.sampleAdminApiBaseUrl) {
    return undefined;
  }

  await input.repository.upsertPlugin({
    ...pluginRecordFromManifest(sampleAdminPlugin),
    config: { baseUrl: input.config.sampleAdminApiBaseUrl }
  });
  for (const tool of pluginToolsFromManifest(sampleAdminPlugin)) {
    await input.repository.upsertPluginTool(tool);
  }
  await input.repository.upsertCredential({
    id: "sample-admin.admin-token",
    pluginId: "sample-admin",
    requirementId: "admin-token",
    name: "Sample admin token",
    type: "bearer",
    secretRef: `env:${input.config.sampleAdminApiTokenEnv}`
  });

  return {
    registry: new PluginRegistry([sampleAdminPlugin]),
    credentialStore: new EnvironmentCredentialStore({ env: input.env }),
    auditLogger: new AuditLogger({ repository: input.repository })
  };
}
