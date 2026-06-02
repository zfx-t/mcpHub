import { AuditLogger } from "@mcphub/audit";
import { EnvironmentCredentialStore } from "@mcphub/credentials";
import type { McpHubRepository } from "@mcphub/db";
import type { PlatformGatewayOptions, PlatformPluginMetadata } from "@mcphub/mcp";
import { PluginRegistry, pluginRecordFromManifest, pluginToolsFromManifest, sampleAdminPlugin, type PluginManifest } from "@mcphub/plugins";
import { loadLocalPlugins } from "@mcphub/plugins/local-loader";
import type { ServerConfig } from "./config.js";

export interface PlatformServicesInput {
  repository: McpHubRepository;
  config: ServerConfig;
  env?: NodeJS.ProcessEnv;
}

export async function createPlatformServices(input: PlatformServicesInput): Promise<PlatformGatewayOptions | undefined> {
  const manifests: PluginManifest[] = [];
  const pluginPolicies: NonNullable<PlatformGatewayOptions["pluginPolicies"]> = {};
  const pluginMetadata: Record<string, PlatformPluginMetadata> = {};
  let hasPlatformState = false;

  if (input.config.sampleAdminApiBaseUrl) {
    hasPlatformState = true;
    manifests.push(sampleAdminPlugin);

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
    pluginMetadata["sample-admin"] = {
      source: "built_in",
      credentials: [{ id: "admin-token", type: "bearer", configured: true }]
    };
    pluginPolicies["sample-admin"] = { dangerousMode: "block" };
  }

  const localPlugins = await loadLocalPlugins({ pluginDir: input.config.pluginDir, existingManifests: manifests });
  hasPlatformState ||= Boolean(input.config.pluginDir) || localPlugins.diagnostics.length > 0 || localPlugins.manifests.length > 0;
  for (const diagnostic of localPlugins.diagnostics) {
    console.warn(`[mcphub] ${diagnostic.code} ${diagnostic.pluginDir ?? ""}: ${diagnostic.message}`);
  }
  for (const plugin of localPlugins.seed.plugins) {
    await input.repository.upsertPlugin(plugin);
    pluginMetadata[plugin.id] = {
      source: "local",
      credentials: localPlugins.seed.credentials
        .filter((credential) => credential.pluginId === plugin.id)
        .map((credential) => ({
          id: credential.requirementId ?? credential.id,
          type: credential.type,
          configured: true
        }))
    };
  }
  for (const tool of localPlugins.seed.pluginTools) {
    await input.repository.upsertPluginTool(tool);
  }
  for (const credential of localPlugins.seed.credentials) {
    await input.repository.upsertCredential(credential);
  }
  manifests.push(...localPlugins.manifests);
  Object.assign(pluginPolicies, localPlugins.policies);

  if (!hasPlatformState) {
    return undefined;
  }

  return {
    registry: new PluginRegistry(manifests),
    credentialStore: new EnvironmentCredentialStore({ env: input.env }),
    auditLogger: new AuditLogger({ repository: input.repository }),
    pluginPolicies,
    pluginMetadata
  };
}
