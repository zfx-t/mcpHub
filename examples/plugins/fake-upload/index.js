export default {
  id: "fake-upload",
  name: "Fake Upload",
  version: "0.1.0",
  type: "custom",
  description: "Example executor plugin that performs a fake multi-step upload workflow.",
  homepage: "https://example.com/fake-upload",
  author: "MCPHub",
  license: "MIT",
  tags: ["example", "upload"],
  mcphub: {
    minVersion: "0.1.0",
    capabilities: ["executor", "credentials", "policy", "audit", "checkpoint", "plugin-config"]
  },
  credentials: [{ id: "upload-token", type: "bearer" }],
  tools: [
    {
      name: "fake.upload.video",
      description: "Run a fake multi-step video upload workflow.",
      inputSchema: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string" },
          dryRun: { type: "boolean" }
        }
      },
      effect: "dangerous",
      credentialRefs: ["upload-token"],
      executor: { type: "module", handler: "uploadVideo" }
    }
  ],
  handlers: {
    async uploadVideo(input, context) {
      await context.checkpoint("validated", { title: input.title, dryRun: Boolean(input.dryRun) });
      if (input.dryRun) {
        return {
          ok: true,
          dryRun: true,
          plan: ["create-session", "upload-part-1", "upload-part-2", "submit", "poll-status"]
        };
      }

      const session = await context.http.post("/upload/session", { title: input.title });
      await context.checkpoint("upload-session-created", { uploadId: session.uploadId });
      await context.http.post(`/upload/${session.uploadId}/parts/1`, { text: "part-one" });
      await context.checkpoint("upload-part", { uploadId: session.uploadId, part: 1 });
      await context.http.post(`/upload/${session.uploadId}/parts/2`, { text: "part-two" });
      await context.checkpoint("upload-part", { uploadId: session.uploadId, part: 2 });
      await context.http.post(`/upload/${session.uploadId}/submit`, {});
      await context.checkpoint("submitted", { uploadId: session.uploadId });
      const status = await context.http.get(`/upload/${session.uploadId}/status`);
      await context.checkpoint("status-polled", { uploadId: status.uploadId, status: status.status });
      return { ok: true, uploadId: status.uploadId, status: status.status };
    }
  }
};
