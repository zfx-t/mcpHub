import { parseVerifyArgs, PluginCliError, verifyUsage } from "./plugin-dev/common.js";
import { verifyPlugin } from "./plugin-dev/verify.js";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseVerifyArgs(argv);
  const result = await verifyPlugin(options.pluginDir);
  for (const line of result.lines) {
    console.log(line);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    if (error instanceof PluginCliError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    console.error(verifyUsage());
    throw error;
  });
}
