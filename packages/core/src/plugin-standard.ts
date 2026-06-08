import type {
  PlatformCapability,
  PluginStandardValidationResult,
  StandardDiagnostic
} from "./types.js";

export const CURRENT_MCPHUB_VERSION = "0.1.0";

export const SUPPORTED_PLATFORM_CAPABILITIES: PlatformCapability[] = [
  "http",
  "executor",
  "credentials",
  "policy",
  "audit",
  "checkpoint",
  "local-loader",
  "plugin-config"
];

export interface PluginStandardManifest {
  id: string;
  version: string;
  mcphub?: {
    minVersion?: string;
    maxVersion?: string;
    capabilities?: string[];
  };
  tools: Array<{
    name: string;
    inputSchema: Record<string, unknown>;
    effect: string;
    operation?: { type: "http"; method?: string; path?: string };
    executor?: { type: "module"; handler?: string };
  }>;
}

export interface ValidatePluginStandardOptions {
  currentVersion?: string;
  supportedCapabilities?: PlatformCapability[];
}

export function validatePluginStandard(
  manifest: PluginStandardManifest,
  options: ValidatePluginStandardOptions = {}
): PluginStandardValidationResult {
  const currentVersion = options.currentVersion ?? CURRENT_MCPHUB_VERSION;
  const supportedCapabilities = new Set(options.supportedCapabilities ?? SUPPORTED_PLATFORM_CAPABILITIES);
  const diagnostics: StandardDiagnostic[] = [];

  if (!isSemverLike(manifest.version)) {
    diagnostics.push(error("PLUGIN_MANIFEST_INVALID", "Plugin version should be semver-like.", "version", "Use a version such as 0.1.0."));
  }

  validateCompatibility(manifest, diagnostics, currentVersion, supportedCapabilities);
  validateTools(manifest, diagnostics);

  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;

  return {
    compatible: errors === 0,
    warnings,
    errors,
    diagnostics
  };
}

export function summarizeStandardDiagnostics(diagnostics: StandardDiagnostic[]): PluginStandardValidationResult {
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  return {
    compatible: errors === 0,
    warnings,
    errors,
    diagnostics
  };
}

function validateCompatibility(
  manifest: PluginStandardManifest,
  diagnostics: StandardDiagnostic[],
  currentVersion: string,
  supportedCapabilities: Set<PlatformCapability>
): void {
  if (!manifest.mcphub) {
    diagnostics.push(
      warning(
        "PLUGIN_COMPATIBILITY_WARNING",
        "Plugin does not declare MCPHub compatibility metadata.",
        "mcphub",
        "Add mcphub.minVersion and mcphub.capabilities so operators can verify compatibility."
      )
    );
    return;
  }

  const { minVersion, maxVersion, capabilities = [] } = manifest.mcphub;
  if (!minVersion) {
    diagnostics.push(
      warning(
        "PLUGIN_COMPATIBILITY_WARNING",
        "Plugin does not declare mcphub.minVersion.",
        "mcphub.minVersion",
        "Set the minimum MCPHub version tested with this plugin."
      )
    );
  } else if (compareSemverLike(minVersion, currentVersion) > 0) {
    diagnostics.push(
      error(
        "PLUGIN_COMPATIBILITY_ERROR",
        `Plugin requires MCPHub ${minVersion} or newer, current version is ${currentVersion}.`,
        "mcphub.minVersion",
        "Upgrade MCPHub or lower the plugin requirement after testing."
      )
    );
  }

  if (maxVersion && compareSemverLike(maxVersion, currentVersion) < 0) {
    diagnostics.push(
      warning(
        "PLUGIN_COMPATIBILITY_WARNING",
        `Plugin declares mcphub.maxVersion ${maxVersion}, current version is ${currentVersion}.`,
        "mcphub.maxVersion",
        "Test the plugin with this MCPHub version and update maxVersion if compatible."
      )
    );
  }

  for (const capability of capabilities) {
    if (!isPlatformCapability(capability) || !supportedCapabilities.has(capability)) {
      diagnostics.push(
        error(
          "PLUGIN_COMPATIBILITY_ERROR",
          `Plugin requires unsupported MCPHub capability ${capability}.`,
          "mcphub.capabilities",
          "Remove the capability requirement or run MCPHub with a version that supports it.",
          { capability }
        )
      );
    }
  }
}

function isPlatformCapability(value: string): value is PlatformCapability {
  return SUPPORTED_PLATFORM_CAPABILITIES.includes(value as PlatformCapability);
}

function validateTools(manifest: PluginStandardManifest, diagnostics: StandardDiagnostic[]): void {
  for (const [index, tool] of manifest.tools.entries()) {
    const path = `tools.${index}`;
    if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/.test(tool.name)) {
      diagnostics.push(
        error(
          "PLUGIN_MANIFEST_INVALID",
          `Tool name ${tool.name} should use <domain>.<resource>.<action> format.`,
          `${path}.name`,
          "Use a lowercase dot-separated name such as admin.users.list."
        )
      );
    }

    const hasOperation = Boolean(tool.operation);
    const hasExecutor = Boolean(tool.executor);
    if (hasOperation === hasExecutor) {
      diagnostics.push(
        error(
          "PLUGIN_MANIFEST_INVALID",
          `Tool ${tool.name} must declare exactly one execution model.`,
          path,
          "Use either operation for single HTTP calls or executor for custom workflows."
        )
      );
    }

    if (!["read", "write", "dangerous"].includes(tool.effect)) {
      diagnostics.push(
        error(
          "PLUGIN_MANIFEST_INVALID",
          `Tool ${tool.name} has invalid effect ${tool.effect}.`,
          `${path}.effect`,
          "Use read, write, or dangerous."
        )
      );
    }

    if (tool.inputSchema?.type !== "object") {
      diagnostics.push(
        error(
          "PLUGIN_MANIFEST_INVALID",
          `Tool ${tool.name} inputSchema should be a top-level JSON object schema.`,
          `${path}.inputSchema`,
          "Set inputSchema.type to object and define properties."
        )
      );
    }

    if (tool.operation && (!tool.operation.method || !tool.operation.path)) {
      diagnostics.push(
        error(
          "PLUGIN_MANIFEST_INVALID",
          `HTTP tool ${tool.name} must include method and path.`,
          `${path}.operation`,
          "Declare operation.method and operation.path."
        )
      );
    }
  }
}

function isSemverLike(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
}

function compareSemverLike(left: string, right: string): number {
  const leftParts = parseSemverParts(left);
  const rightParts = parseSemverParts(right);
  for (let index = 0; index < 3; index += 1) {
    const diff = leftParts[index] - rightParts[index];
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function parseSemverParts(value: string): [number, number, number] {
  const [major = "0", minor = "0", patch = "0"] = value.split(/[+-]/, 1)[0].split(".");
  return [Number(major) || 0, Number(minor) || 0, Number(patch) || 0];
}

function warning(code: StandardDiagnostic["code"], message: string, path: string, suggestion: string): StandardDiagnostic {
  return {
    severity: "warning",
    code,
    message,
    path,
    suggestion
  };
}

function error(
  code: StandardDiagnostic["code"],
  message: string,
  path: string,
  suggestion: string,
  details?: Record<string, unknown>
): StandardDiagnostic {
  return {
    severity: "error",
    code,
    message,
    path,
    suggestion,
    details
  };
}
