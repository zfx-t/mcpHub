import {
  pluginDisplayName,
  toolEffectForTemplate,
  type CreatePluginOptions
} from "./common.js";

export interface GeneratedPluginFiles {
  files: Record<string, string>;
}

export function generatePluginFiles(options: CreatePluginOptions): GeneratedPluginFiles {
  return {
    files: {
      "index.js": options.template === "http-api" ? httpApiIndex(options) : executorIndex(options),
      "plugin.config.json": pluginConfig(options),
      "README.md": pluginReadme(options)
    }
  };
}

function httpApiIndex(options: CreatePluginOptions): string {
  return `export default {
  id: "${options.pluginName}",
  name: "${pluginDisplayName(options.pluginName)}",
  version: "0.1.0",
  type: "api",
  description: "Expose ${options.pluginName} APIs as MCP tools.",
  mcphub: {
    minVersion: "0.1.0",
    capabilities: ["http", "credentials", "policy", "plugin-config"]
  },
  credentials: [{ id: "${options.credentialId}", type: "${options.credentialType}" }],
  tools: [
    {
      name: "${options.toolName}",
      description: "Read example data from ${options.pluginName}.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" }
        }
      },
      effect: "${toolEffectForTemplate(options.template)}",
      credentialRefs: ["${options.credentialId}"],
      operation: { type: "http", method: "GET", path: "/api/example" }
    }
  ]
};
`;
}

function executorIndex(options: CreatePluginOptions): string {
  return `export default {
  id: "${options.pluginName}",
  name: "${pluginDisplayName(options.pluginName)}",
  version: "0.1.0",
  type: "custom",
  description: "Expose ${options.pluginName} workflows as MCP tools.",
  mcphub: {
    minVersion: "0.1.0",
    capabilities: ["executor", "credentials", "policy", "audit", "checkpoint", "plugin-config"]
  },
  credentials: [{ id: "${options.credentialId}", type: "${options.credentialType}" }],
  tools: [
    {
      name: "${options.toolName}",
      description: "Run an example ${options.pluginName} workflow.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          dryRun: { type: "boolean" }
        }
      },
      effect: "${toolEffectForTemplate(options.template)}",
      credentialRefs: ["${options.credentialId}"],
      executor: { type: "module", handler: "runWorkflow" }
    }
  ],
  handlers: {
    async runWorkflow(input, context) {
      await context.checkpoint("validated", {
        title: input.title ?? "Untitled",
        dryRun: Boolean(input.dryRun)
      });

      if (input.dryRun) {
        return {
          ok: true,
          dryRun: true,
          plan: ["validate", "call-remote-api", "normalize-result"]
        };
      }

      const remoteResult = await context.http.post("/api/example", {
        title: input.title ?? "Untitled"
      });
      await context.checkpoint("remote-called", { received: true });

      return {
        ok: true,
        result: remoteResult
      };
    }
  }
};
`;
}

function pluginConfig(options: CreatePluginOptions): string {
  return `${JSON.stringify(
    {
      enabled: true,
      config: {
        baseUrl: options.baseUrl
      },
      credentials: {
        [options.credentialId]: {
          type: options.credentialType,
          secretRef: `env:${options.secretEnv}`
        }
      },
      policy: {
        dangerousMode: "auditOnly"
      }
    },
    null,
    2
  )}
`;
}

function pluginReadme(options: CreatePluginOptions): string {
  const mode = options.template === "http-api" ? "HTTP API" : "executor workflow";
  return `# ${pluginDisplayName(options.pluginName)}

This is a generated MCPHub ${mode} plugin.

## Files

- \`index.js\`: plugin manifest and tool definition.
- \`plugin.config.json\`: deployment config, credential bindings, and policy.

## Edit Next

1. Update \`description\`, \`inputSchema\`, and the tool body in \`index.js\`.
2. Set \`config.baseUrl\` in \`plugin.config.json\` to your real service URL.
3. Review the plugin standard in \`docs/plugins/standard.md\`.
4. Export the required secret before running MCPHub:

\`\`\`bash
export ${options.secretEnv}=replace-me
\`\`\`

## Verify

\`\`\`bash
pnpm plugin:verify ${options.outDir}/${options.pluginName}
\`\`\`

When using a custom plugin root, pass the full plugin directory:

\`\`\`bash
pnpm plugin:verify /path/to/plugins/${options.pluginName}
\`\`\`
`;
}
