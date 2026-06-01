import type { Rule, Source } from "@mcphub/core";
import type { McpHubRepository } from "./repository.js";
import { MemoryRepository } from "./repository.js";

export const seedSources: Source[] = [
  {
    id: "src_example_articles",
    name: "Example Articles",
    description: "A sample article source used for local development and tests.",
    urlPattern: "domain:example.com",
    routeKey: "example_articles",
    owner: "system",
    visibility: "public",
    refreshPolicy: { ttlSeconds: 300, staleWhileRevalidateSeconds: 3600 },
    authRequirement: "none",
    riskFlags: [],
    healthStatus: "healthy",
    failureCount: 0
  },
  {
    id: "src_newsroom",
    name: "Newsroom",
    description: "A sample custom route for newsroom pages.",
    urlPattern: "domain:news.example.net",
    routeKey: "newsroom",
    owner: "system",
    visibility: "public",
    refreshPolicy: { ttlSeconds: 600, staleWhileRevalidateSeconds: 3600 },
    authRequirement: "none",
    riskFlags: [],
    healthStatus: "healthy",
    failureCount: 0
  },
  {
    id: "src_private_docs",
    name: "Private Docs",
    description: "A restricted source used to verify detector policy handling.",
    urlPattern: "domain:private.example.org",
    routeKey: "private_docs",
    owner: "operator",
    visibility: "private",
    refreshPolicy: { ttlSeconds: 900 },
    authRequirement: "required",
    riskFlags: ["auth_required"],
    healthStatus: "unknown",
    failureCount: 0
  },
  {
    id: "src_blog_posts",
    name: "Blog Posts",
    description: "A sample blog route used to verify the third custom extractor.",
    urlPattern: "domain:blog.example.io",
    routeKey: "blog_posts",
    owner: "system",
    visibility: "public",
    refreshPolicy: { ttlSeconds: 600, staleWhileRevalidateSeconds: 3600 },
    authRequirement: "none",
    riskFlags: [],
    healthStatus: "healthy",
    failureCount: 0
  }
];

export const seedRules: Rule[] = [
  {
    id: "rule_example_articles_v1",
    sourceId: "src_example_articles",
    type: "custom_route",
    version: 1,
    urlPattern: "domain:example.com",
    fieldMappings: { title: "h1", content: "article" },
    sampleUrls: ["https://example.com/articles/hello"],
    confidence: 0.95,
    status: "active"
  },
  {
    id: "rule_newsroom_v1",
    sourceId: "src_newsroom",
    type: "custom_route",
    version: 1,
    urlPattern: "domain:news.example.net",
    fieldMappings: { title: "h1", content: "main" },
    sampleUrls: ["https://news.example.net/story/launch"],
    confidence: 0.92,
    status: "active"
  },
  {
    id: "rule_private_docs_v1",
    sourceId: "src_private_docs",
    type: "validated",
    version: 1,
    urlPattern: "domain:private.example.org",
    fieldMappings: { title: "h1", content: "article" },
    sampleUrls: ["https://private.example.org/docs/a"],
    confidence: 0.8,
    status: "active"
  },
  {
    id: "rule_blog_posts_v1",
    sourceId: "src_blog_posts",
    type: "custom_route",
    version: 1,
    urlPattern: "domain:blog.example.io",
    fieldMappings: { title: "h1", content: "article" },
    sampleUrls: ["https://blog.example.io/posts/one"],
    confidence: 0.9,
    status: "active"
  }
];

export function createSeedRepository(): MemoryRepository {
  return new MemoryRepository({ sources: seedSources, rules: seedRules });
}

export async function seedRepository(repository: McpHubRepository): Promise<void> {
  for (const source of seedSources) {
    await repository.upsertSource(source);
  }
  for (const rule of seedRules) {
    await repository.upsertRule(rule);
  }
}
