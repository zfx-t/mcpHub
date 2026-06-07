import { createPlugin } from "./plugin-dev/create.js";
import { createUsage, parseCreateArgs, PluginCliError, relativeFromCwd } from "./plugin-dev/common.js";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseCreateArgs(argv);
  const result = await createPlugin(options);
  console.log("Plugin created");
  console.log(`Plugin directory: ${relativeFromCwd(result.pluginDir)}`);
  console.log("Files:");
  for (const file of result.files) {
    console.log(`- ${relativeFromCwd(file)}`);
  }
  console.log("");
  console.log("Next steps:");
  console.log(`- pnpm plugin:verify ${relativeFromCwd(result.pluginDir)}`);
  console.log(`- Edit ${relativeFromCwd(result.pluginDir)}/index.js and plugin.config.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    if (error instanceof PluginCliError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    console.error(createUsage());
    throw error;
  });
}
