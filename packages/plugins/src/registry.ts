import type { Plugin, PluginTool } from "@mcphub/core";
import type { PluginManifest } from "./sdk.js";

export class PluginRegistry {
  private readonly manifests = new Map<string, PluginManifest>();

  constructor(manifests: PluginManifest[] = []) {
    for (const manifest of manifests) {
      this.register(manifest);
    }
  }

  register(manifest: PluginManifest): void {
    if (this.manifests.has(manifest.id)) {
      throw new Error(`Duplicate plugin id ${manifest.id}`);
    }
    const existingToolNames = new Set(this.listPluginTools().map((tool) => tool.name));
    for (const tool of manifest.tools) {
      if (existingToolNames.has(tool.name)) {
        throw new Error(`Duplicate plugin tool name ${tool.name}`);
      }
    }
    this.manifests.set(manifest.id, manifest);
  }

  listManifests(): PluginManifest[] {
    return [...this.manifests.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  getManifest(pluginId: string): PluginManifest | undefined {
    return this.manifests.get(pluginId);
  }

  listPlugins(): Plugin[] {
    return this.listManifests().map((manifest) => pluginRecordFromManifest(manifest));
  }

  listPluginTools(pluginId?: string): PluginTool[] {
    return this.listManifests()
      .filter((manifest) => !pluginId || manifest.id === pluginId)
      .flatMap((manifest) => pluginToolsFromManifest(manifest))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getPluginToolByName(name: string): PluginTool | undefined {
    return this.listPluginTools().find((tool) => tool.name === name);
  }
}

export function pluginRecordFromManifest(manifest: PluginManifest): Plugin {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    description: manifest.description,
    enabled: true,
    config: {}
  };
}

export function pluginToolsFromManifest(manifest: PluginManifest): PluginTool[] {
  return manifest.tools.map((tool) => ({
    id: `${manifest.id}.${tool.name}`,
    pluginId: manifest.id,
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    effect: tool.effect,
    requiresConfirmation: tool.requiresConfirmation ?? tool.effect === "dangerous",
    credentialRefs: tool.credentialRefs,
    operation: tool.operation,
    executor: tool.executor,
    enabled: true
  }));
}
