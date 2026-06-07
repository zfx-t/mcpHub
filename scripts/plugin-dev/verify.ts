import { stat } from "node:fs/promises";
import path from "node:path";
import {
  loadLocalPlugins,
  type LocalPluginDiagnostic,
  type LocalPluginLoadResult
} from "../../packages/plugins/src/local-loader.js";
import { PluginCliError, relativeFromCwd, toolMode } from "./common.js";

export interface VerifyPluginResult {
  status: "passed" | "skipped";
  pluginName: string;
  pluginDir: string;
  lines: string[];
}

export async function verifyPlugin(pluginDirInput: string): Promise<VerifyPluginResult> {
  const pluginDir = path.resolve(pluginDirInput);
  const pluginName = path.basename(pluginDir);
  await assertRequiredFile(pluginDir, "directory");
  await assertRequiredFile(path.join(pluginDir, "index.js"), "file");
  await assertRequiredFile(path.join(pluginDir, "plugin.config.json"), "file");

  const parentDir = path.dirname(pluginDir);
  const result = await loadLocalPlugins({ pluginDir: parentDir });
  const loadedDiagnostic = result.diagnostics.find(
    (diagnostic) => diagnostic.code === "loaded_plugin" && diagnostic.pluginDir && path.resolve(diagnostic.pluginDir) === pluginDir
  );
  const targetManifest = loadedDiagnostic?.pluginId
    ? result.manifests.find((manifest) => manifest.id === loadedDiagnostic.pluginId)
    : undefined;
  if (targetManifest) {
    return {
      status: "passed",
      pluginName: targetManifest.id,
      pluginDir,
      lines: [
        "Plugin verification passed",
        `Plugin: ${targetManifest.id}`,
        "Tools:",
        ...targetManifest.tools.map((tool) => `- ${tool.name} (${tool.effect}, ${toolMode(tool)})`)
      ]
    };
  }

  const targetDiagnostics = diagnosticsForTarget(result, pluginDir, pluginName);
  const disabled = targetDiagnostics.find((diagnostic) => diagnostic.code === "disabled_plugin");
  if (disabled) {
    return {
      status: "skipped",
      pluginName,
      pluginDir,
      lines: ["Plugin verification skipped", `Plugin: ${pluginName}`, "Reason: disabled in plugin.config.json"]
    };
  }

  const diagnostics = targetDiagnostics.length > 0 ? targetDiagnostics : result.diagnostics;
  const detail = diagnostics.length > 0 ? diagnostics.map(formatDiagnostic).join("\n") : "No loader diagnostics were produced.";
  throw new PluginCliError(`Plugin verification failed for ${relativeFromCwd(pluginDir)}.\n${detail}`);
}

function diagnosticsForTarget(result: LocalPluginLoadResult, pluginDir: string, pluginName: string): LocalPluginDiagnostic[] {
  return result.diagnostics.filter((diagnostic) => {
    if (diagnostic.pluginDir && path.resolve(diagnostic.pluginDir) === pluginDir) {
      return true;
    }
    return diagnostic.pluginId === pluginName;
  });
}

function formatDiagnostic(diagnostic: LocalPluginDiagnostic): string {
  const target = diagnostic.toolName ? ` ${diagnostic.toolName}` : diagnostic.pluginId ? ` ${diagnostic.pluginId}` : "";
  return `- [${diagnostic.severity}] ${diagnostic.code}${target}: ${diagnostic.message}`;
}

async function assertRequiredFile(targetPath: string, expected: "directory" | "file"): Promise<void> {
  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(targetPath);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT") {
      throw new PluginCliError(`Missing ${expected}: ${relativeFromCwd(targetPath)}.`);
    }
    throw error;
  }
  const ok = expected === "directory" ? stats.isDirectory() : stats.isFile();
  if (!ok) {
    throw new PluginCliError(`Expected ${relativeFromCwd(targetPath)} to be a ${expected}.`);
  }
}
