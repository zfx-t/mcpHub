import { createSeedRepository, PostgresRepository, seedRepository } from "@mcphub/db";
import { ExtractionService, HttpFetcher } from "@mcphub/extractors";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPlatformServices } from "./platform.js";

const config = loadConfig();
const repository = config.databaseUrl ? new PostgresRepository(config.databaseUrl) : createSeedRepository();
if (repository instanceof PostgresRepository) {
  await repository.migrate();
  await seedRepository(repository);
}
const extraction = new ExtractionService(repository, new HttpFetcher(config.fetchTimeoutMs));
const platform = await createPlatformServices({ repository, config });
const app = createApp({ repository, extraction, config, platform });

await app.listen({ host: config.host, port: config.port });
