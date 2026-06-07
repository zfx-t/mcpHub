import { mkdir, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseCreateArgs, parseVerifyArgs, PluginCliError } from "./plugin-dev/common.js";
import { createPlugin } from "./plugin-dev/create.js";
import { verifyPlugin } from "./plugin-dev/verify.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("plugin developer CLI", () => {
  it("creates and verifies an HTTP API plugin", async () => {
    const outDir = await tempDir();
    const options = parseCreateArgs(["my-admin", "--template", "http-api", "--out", outDir, "--tool-name", "admin.users.list"]);

    const created = await createPlugin(options);
    const verified = await verifyPlugin(created.pluginDir);

    expect(created.files.map((file) => path.basename(file)).sort()).toEqual(["README.md", "index.js", "plugin.config.json"]);
    expect(verified.lines).toEqual(["Plugin verification passed", "Plugin: my-admin", "Tools:", "- admin.users.list (read, http)"]);
  });

  it("creates and verifies an executor plugin", async () => {
    const outDir = await tempDir();
    const options = parseCreateArgs(["my-workflow", "--template", "executor", "--out", outDir, "--tool-name", "workflow.run"]);

    const created = await createPlugin(options);
    const verified = await verifyPlugin(created.pluginDir);

    expect(verified.lines).toEqual(["Plugin verification passed", "Plugin: my-workflow", "Tools:", "- workflow.run (write, executor)"]);
    const indexSource = await readFile(path.join(created.pluginDir, "index.js"), "utf8");
    expect(indexSource).toContain('handler: "runWorkflow"');
    expect(indexSource).toContain("async runWorkflow");
  });

  it("creates and verifies plugins with underscore names", async () => {
    const outDir = await tempDir();
    const options = parseCreateArgs(["dev_exec", "--template", "executor", "--out", outDir, "--tool-name", "dev.exec.run"]);

    const created = await createPlugin(options);
    const verified = await verifyPlugin(created.pluginDir);

    expect(verified.lines).toEqual(["Plugin verification passed", "Plugin: dev_exec", "Tools:", "- dev.exec.run (write, executor)"]);
  });

  it("fails when an output directory exists without force", async () => {
    const outDir = await tempDir();
    const options = parseCreateArgs(["my-admin", "--template", "http-api", "--out", outDir]);
    await createPlugin(options);

    await expect(createPlugin(options)).rejects.toThrow(/already exists/);
  });

  it("refuses to force overwrite a non-plugin directory", async () => {
    const outDir = await tempDir();
    const targetDir = path.join(outDir, "packages");
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, "keep.txt"), "do not delete", "utf8");
    const options = parseCreateArgs(["packages", "--template", "http-api", "--out", outDir, "--force"]);

    await expect(createPlugin(options)).rejects.toThrow(/does not look like an MCPHub plugin directory/);
    await expect(readFile(path.join(targetDir, "keep.txt"), "utf8")).resolves.toBe("do not delete");
  });

  it("rejects unknown templates and invalid plugin names", () => {
    expect(() => parseCreateArgs(["my-admin", "--template", "made-up"])).toThrow(PluginCliError);
    expect(() => parseCreateArgs(["My_Admin", "--template", "http-api"])).toThrow(PluginCliError);
  });

  it("rejects unknown options", () => {
    expect(() => parseCreateArgs(["my-admin", "--template", "http-api", "--extra", "value"])).toThrow(/Unknown option --extra/);
    expect(() => parseVerifyArgs(["examples/plugins/my-admin", "--extra", "value"])).toThrow(/Unknown option --extra/);
  });

  it("fails verification for a missing plugin directory", async () => {
    const outDir = await tempDir();

    await expect(verifyPlugin(path.join(outDir, "missing"))).rejects.toThrow(/Missing directory/);
  });

  it("fails verification when an executor handler is missing", async () => {
    const outDir = await tempDir();
    const options = parseCreateArgs(["my-workflow", "--template", "executor", "--out", outDir, "--tool-name", "workflow.run"]);
    const created = await createPlugin(options);
    const indexPath = path.join(created.pluginDir, "index.js");
    const indexSource = await readFile(indexPath, "utf8");
    await writeFile(indexPath, indexSource.replace("runWorkflow(input, context)", "otherWorkflow(input, context)"), "utf8");

    await expect(verifyPlugin(created.pluginDir)).rejects.toThrow(/executor_handler_missing/);
  });

  it("reports disabled plugins as skipped", async () => {
    const outDir = await tempDir();
    const options = parseCreateArgs(["my-admin", "--template", "http-api", "--out", outDir]);
    const created = await createPlugin(options);
    const configPath = path.join(created.pluginDir, "plugin.config.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as { enabled: boolean };
    config.enabled = false;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const result = await verifyPlugin(created.pluginDir);

    expect(result.lines).toEqual(["Plugin verification skipped", "Plugin: my-admin", "Reason: disabled in plugin.config.json"]);
  });

  it("verifies the manifest loaded from the exact target directory", async () => {
    const outDir = await tempDir();
    const left = await createPlugin(parseCreateArgs(["left-plugin", "--template", "http-api", "--out", outDir, "--tool-name", "left.plugin.read"]));
    const right = await createPlugin(parseCreateArgs(["right-plugin", "--template", "http-api", "--out", outDir, "--tool-name", "right.plugin.read"]));
    const rightIndex = await readFile(path.join(right.pluginDir, "index.js"), "utf8");
    await writeFile(path.join(right.pluginDir, "index.js"), rightIndex.replace('id: "right-plugin"', 'id: "custom-plugin"'), "utf8");

    const leftResult = await verifyPlugin(left.pluginDir);
    const rightResult = await verifyPlugin(right.pluginDir);

    expect(leftResult.lines).toEqual(["Plugin verification passed", "Plugin: left-plugin", "Tools:", "- left.plugin.read (read, http)"]);
    expect(rightResult.lines).toEqual(["Plugin verification passed", "Plugin: custom-plugin", "Tools:", "- right.plugin.read (read, http)"]);
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcphub-plugin-cli-test-"));
  tempDirs.push(dir);
  await mkdir(dir, { recursive: true });
  return dir;
}
