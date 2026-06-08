import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { generatePluginFiles } from "./templates.js";
import { PluginCliError, relativeFromCwd, type CreatePluginOptions } from "./common.js";

export interface CreatePluginResult {
  pluginDir: string;
  files: string[];
}

export async function createPlugin(options: CreatePluginOptions): Promise<CreatePluginResult> {
  const parentDir = path.resolve(options.outDir);
  const pluginDir = path.resolve(parentDir, options.pluginName);
  ensureInsideParent(parentDir, pluginDir);

  const existing = await pathExists(pluginDir);
  if (existing && !options.force) {
    throw new PluginCliError(`Plugin directory already exists: ${relativeFromCwd(pluginDir)}. Re-run with --force to overwrite.`);
  }

  if (existing && options.force) {
    await assertSafePluginOverwrite(pluginDir, options.pluginName);
  }

  await mkdir(pluginDir, { recursive: true });
  const generated = generatePluginFiles(options);
  const fileNames = Object.keys(generated.files).sort();
  for (const fileName of fileNames) {
    await writeFile(path.join(pluginDir, fileName), generated.files[fileName], "utf8");
  }

  return {
    pluginDir,
    files: fileNames.map((fileName) => path.join(pluginDir, fileName))
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function ensureInsideParent(parentDir: string, pluginDir: string): void {
  const relative = path.relative(parentDir, pluginDir);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PluginCliError("Refusing to write outside the output directory.");
  }
}

async function assertSafePluginOverwrite(pluginDir: string, expectedPluginId: string): Promise<void> {
  const entryPath = path.join(pluginDir, "index.js");
  const configPath = path.join(pluginDir, "plugin.config.json");
  const entryExists = await isFile(entryPath);
  const configExists = await isFile(configPath);
  if (!entryExists || !configExists) {
    throw new PluginCliError(
      `Refusing to overwrite ${relativeFromCwd(pluginDir)} because it does not look like an MCPHub plugin directory.`
    );
  }

  const entrySource = await readFile(entryPath, "utf8");
  if (!entrySource.includes(`id: "${expectedPluginId}"`) && !entrySource.includes(`"id": "${expectedPluginId}"`)) {
    throw new PluginCliError(
      `Refusing to overwrite ${relativeFromCwd(pluginDir)} because its plugin id does not match ${expectedPluginId}.`
    );
  }
}

async function isFile(targetPath: string): Promise<boolean> {
  try {
    const stats = await stat(targetPath);
    return stats.isFile();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
