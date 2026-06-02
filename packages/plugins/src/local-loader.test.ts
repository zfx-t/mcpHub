import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PluginRegistry, sampleAdminPlugin, webContentPlugin } from "./index.js";
import { loadLocalPlugins, localPluginConfigSchema, type LocalPluginConfigInput } from "./local-loader.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("localPluginConfigSchema", () => {
  it("defaults dangerousMode to auditOnly", () => {
    const config = localPluginConfigSchema.parse({
      enabled: true,
      config: { baseUrl: "https://example.test" },
      credentials: {}
    });

    expect(config.policy.dangerousMode).toBe("auditOnly");
  });

  it("rejects invalid dangerousMode, invalid credential type, and missing secretRef", () => {
    expect(() =>
      localPluginConfigSchema.parse({
        enabled: true,
        config: {},
        credentials: {
          token: { type: "made_up", secretRef: "env:TOKEN" }
        },
        policy: { dangerousMode: "unsafe" }
      } satisfies Record<string, unknown>)
    ).toThrow();

    expect(() =>
      localPluginConfigSchema.parse({
        enabled: true,
        config: {},
        credentials: {
          token: { type: "bearer" }
        }
      } satisfies Record<string, unknown>)
    ).toThrow();
  });
});

describe("loadLocalPlugins", () => {
  it("returns no manifests when the plugin directory is missing", async () => {
    const result = await loadLocalPlugins({ pluginDir: path.join(os.tmpdir(), "mcphub-missing-dir") });

    expect(result.manifests).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "plugin_dir_missing"
      })
    ]);
  });

  it("loads a valid local plugin and returns manifests, policies, diagnostics, and seed records", async () => {
    const pluginDir = await createTempPluginDir();
    await writeLocalPlugin(pluginDir, "admin-users-local", {
      entry: pluginModule({
        id: "admin-users-local",
        toolName: "admin.users.listlocal",
        credentialId: "admin-token"
      }),
      config: {
        enabled: true,
        config: { baseUrl: "https://admin.example.test" },
        credentials: {
          "admin-token": {
            type: "bearer",
            secretRef: "env:ADMIN_TOKEN"
          }
        }
      } satisfies LocalPluginConfigInput
    });

    const result = await loadLocalPlugins({ pluginDir });

    expect(result.manifests.map((manifest) => manifest.id)).toEqual(["admin-users-local"]);
    expect(result.policies).toEqual({
      "admin-users-local": {
        dangerousMode: "auditOnly"
      }
    });
    expect(result.seed.plugins).toEqual([
      expect.objectContaining({
        id: "admin-users-local",
        enabled: true,
        config: { baseUrl: "https://admin.example.test" }
      })
    ]);
    expect(result.seed.pluginTools).toEqual([
      expect.objectContaining({
        pluginId: "admin-users-local",
        name: "admin.users.listlocal",
        enabled: true
      })
    ]);
    expect(result.seed.credentials).toEqual([
      expect.objectContaining({
        id: "admin-users-local.admin-token",
        pluginId: "admin-users-local",
        requirementId: "admin-token",
        type: "bearer",
        secretRef: "env:ADMIN_TOKEN"
      })
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "loaded_plugin",
        pluginId: "admin-users-local"
      })
    ]);
  });

  it("skips a plugin with a broken module import", async () => {
    const pluginDir = await createTempPluginDir();
    await writeLocalPlugin(pluginDir, "broken", {
      entry: "throw new Error('boom');\n",
      config: {
        enabled: true,
        config: {},
        credentials: {}
      } satisfies LocalPluginConfigInput
    });

    const result = await loadLocalPlugins({ pluginDir });

    expect(result.manifests).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "manifest_import_error"
      })
    ]);
  });

  it("continues loading valid plugins after a broken plugin in the same directory", async () => {
    const pluginDir = await createTempPluginDir();
    await writeLocalPlugin(pluginDir, "a-broken", {
      entry: "throw new Error('boom');\n",
      config: {
        enabled: true,
        config: {},
        credentials: {}
      } satisfies LocalPluginConfigInput
    });
    await writeLocalPlugin(pluginDir, "b-valid", {
      entry: pluginModule({ id: "valid-after-broken", toolName: "admin.users.validafterbroken" }),
      config: {
        enabled: true,
        config: { baseUrl: "https://admin.example.test" },
        credentials: {}
      } satisfies LocalPluginConfigInput
    });

    const result = await loadLocalPlugins({ pluginDir });

    expect(result.manifests.map((manifest) => manifest.id)).toEqual(["valid-after-broken"]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "manifest_import_error"
      }),
      expect.objectContaining({
        code: "loaded_plugin",
        pluginId: "valid-after-broken"
      })
    ]);
  });

  it("skips a plugin with missing plugin.config.json", async () => {
    const pluginDir = await createTempPluginDir();
    const pluginPath = path.join(pluginDir, "missing-config");
    await mkdir(pluginPath, { recursive: true });
    await writeFile(path.join(pluginPath, "index.js"), pluginModule({ id: "missing-config", toolName: "admin.users.missingconfig" }));

    const result = await loadLocalPlugins({ pluginDir });

    expect(result.manifests).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "missing_config"
      })
    ]);
  });

  it("skips a plugin with an invalid manifest", async () => {
    const pluginDir = await createTempPluginDir();
    await writeLocalPlugin(pluginDir, "invalid-manifest", {
      entry: "export default { id: 'Invalid Manifest' };\n",
      config: {
        enabled: true,
        config: {},
        credentials: {}
      } satisfies LocalPluginConfigInput
    });

    const result = await loadLocalPlugins({ pluginDir });

    expect(result.manifests).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "manifest_validation_error"
      })
    ]);
  });

  it("skips later plugins that duplicate an already-loaded tool name", async () => {
    const pluginDir = await createTempPluginDir();
    await writeLocalPlugin(pluginDir, "a-first", {
      entry: pluginModule({ id: "plugin-first", toolName: "admin.users.duplicate" }),
      config: {
        enabled: true,
        config: {},
        credentials: {}
      } satisfies LocalPluginConfigInput
    });
    await writeLocalPlugin(pluginDir, "b-second", {
      entry: pluginModule({ id: "plugin-second", toolName: "admin.users.duplicate" }),
      config: {
        enabled: true,
        config: {},
        credentials: {}
      } satisfies LocalPluginConfigInput
    });

    const result = await loadLocalPlugins({ pluginDir });

    expect(result.manifests.map((manifest) => manifest.id)).toEqual(["plugin-first"]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "loaded_plugin", pluginId: "plugin-first" }),
      expect.objectContaining({ code: "duplicate_tool_name", pluginId: "plugin-second", toolName: "admin.users.duplicate" })
    ]);
  });

  it("skips plugins that duplicate an existing plugin id", async () => {
    const pluginDir = await createTempPluginDir();
    await writeLocalPlugin(pluginDir, "web-content", {
      entry: pluginModule({ id: "web-content", toolName: "admin.users.fromlocal" }),
      config: {
        enabled: true,
        config: {},
        credentials: {}
      } satisfies LocalPluginConfigInput
    });

    const result = await loadLocalPlugins({ pluginDir, existingManifests: [webContentPlugin] });

    expect(result.manifests).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "duplicate_plugin_id",
        pluginId: "web-content"
      })
    ]);
  });

  it("skips disabled plugins so they do not appear in registry tools", async () => {
    const pluginDir = await createTempPluginDir();
    const sideEffectPath = path.join(pluginDir, "disabled-side-effect");
    await writeLocalPlugin(pluginDir, "disabled-plugin", {
      entry: `import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(sideEffectPath)}, "imported");
${pluginModule({ id: "disabled-plugin", toolName: "admin.users.disabledtool" })}`,
      config: {
        enabled: false,
        config: {},
        credentials: {}
      } satisfies LocalPluginConfigInput
    });

    const result = await loadLocalPlugins({ pluginDir, existingManifests: [sampleAdminPlugin] });
    const registry = new PluginRegistry([...result.manifests, sampleAdminPlugin]);

    expect(result.manifests).toEqual([]);
    expect(registry.listPluginTools().map((tool) => tool.name)).toEqual([
      "admin.users.disable",
      "admin.users.list"
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "disabled_plugin"
      })
    ]);
    await expect(access(sideEffectPath)).rejects.toThrow();
  });
});

async function createTempPluginDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcphub-plugins-"));
  tempDirs.push(dir);
  return dir;
}

async function writeLocalPlugin(
  pluginDir: string,
  name: string,
  files: {
    entry: string;
    config?: Record<string, unknown>;
  }
) {
  const targetDir = path.join(pluginDir, name);
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, "index.js"), files.entry);
  if (files.config) {
    await writeFile(path.join(targetDir, "plugin.config.json"), JSON.stringify(files.config, null, 2));
  }
}

function pluginModule(input: { id: string; toolName: string; credentialId?: string }) {
  const credentials = input.credentialId
    ? [{ id: input.credentialId, type: "bearer" }]
    : [];
  const credentialRefs = input.credentialId ? [input.credentialId] : [];
  return `export default ${JSON.stringify(
    {
      id: input.id,
      name: input.id,
      version: "0.1.0",
      type: "api",
      description: `${input.id} plugin`,
      credentials,
      tools: [
        {
          name: input.toolName,
          description: `Tool ${input.toolName}`,
          inputSchema: { type: "object" },
          effect: "read",
          credentialRefs,
          operation: {
            type: "http",
            method: "GET",
            path: "/status"
          }
        }
      ]
    },
    null,
    2
  )};\n`;
}
