import type { Credential, CredentialType } from "@mcphub/core";

export interface ResolvedCredential {
  id: string;
  pluginId: string;
  type: CredentialType;
  value: string;
  scope?: string;
}

export interface CredentialStore {
  resolve(credential: Credential): Promise<ResolvedCredential>;
  resolveAll(credentials: Credential[]): Promise<ResolvedCredential[]>;
}

export interface EnvironmentCredentialStoreOptions {
  env?: NodeJS.ProcessEnv;
}

export class EnvironmentCredentialStore implements CredentialStore {
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: EnvironmentCredentialStoreOptions = {}) {
    this.env = options.env ?? process.env;
  }

  async resolve(credential: Credential): Promise<ResolvedCredential> {
    const envName = envNameFromSecretRef(credential.secretRef);
    const value = this.env[envName];
    if (!value) {
      throw new CredentialResolutionError("CREDENTIAL_MISSING", `Credential ${credential.id} references missing environment variable ${envName}.`);
    }
    return {
      id: credential.id,
      pluginId: credential.pluginId,
      type: credential.type,
      value,
      scope: credential.scope
    };
  }

  async resolveAll(credentials: Credential[]): Promise<ResolvedCredential[]> {
    const resolved: ResolvedCredential[] = [];
    for (const credential of credentials) {
      resolved.push(await this.resolve(credential));
    }
    return resolved;
  }
}

export type CredentialResolutionCode = "CREDENTIAL_MISSING" | "CREDENTIAL_INVALID";

export class CredentialResolutionError extends Error {
  constructor(
    readonly code: CredentialResolutionCode,
    message: string
  ) {
    super(message);
    this.name = "CredentialResolutionError";
  }
}

export function envNameFromSecretRef(secretRef: string): string {
  if (secretRef.startsWith("env:")) {
    return secretRef.slice("env:".length);
  }
  return secretRef;
}
