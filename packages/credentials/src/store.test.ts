import { describe, expect, it } from "vitest";
import type { Credential } from "@mcphub/core";
import { CredentialResolutionError, EnvironmentCredentialStore, envNameFromSecretRef } from "./store.js";

const credential: Credential = {
  id: "admin-token",
  pluginId: "admin",
  name: "Admin token",
  type: "bearer",
  secretRef: "env:ADMIN_TOKEN",
  scope: "https://admin.local"
};

describe("EnvironmentCredentialStore", () => {
  it("resolves credentials from env secret refs", async () => {
    const store = new EnvironmentCredentialStore({ env: { ADMIN_TOKEN: "secret-token" } });

    await expect(store.resolve(credential)).resolves.toEqual({
      id: "admin-token",
      pluginId: "admin",
      type: "bearer",
      value: "secret-token",
      scope: "https://admin.local"
    });
  });

  it("rejects missing env vars without exposing secret values", async () => {
    const store = new EnvironmentCredentialStore({ env: {} });

    await expect(store.resolve(credential)).rejects.toBeInstanceOf(CredentialResolutionError);
    await expect(store.resolve(credential)).rejects.toMatchObject({ code: "CREDENTIAL_MISSING" });
  });

  it("accepts bare environment variable references", () => {
    expect(envNameFromSecretRef("ADMIN_TOKEN")).toBe("ADMIN_TOKEN");
  });
});
