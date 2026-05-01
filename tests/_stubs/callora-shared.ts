// Vitest stub for @callora/shared. Tests that need real shape should use
// vi.mock() with a fuller factory; this only avoids the "no generated
// prisma client" load error during module evaluation.

export const prisma: any = new Proxy(
  {},
  {
    get() {
      return new Proxy(
        {},
        {
          get: () =>
            (..._args: any[]) =>
              Promise.resolve(null),
        }
      );
    },
  }
);

export const meterAndCharge = async (..._args: any[]) => undefined;
export const recordUsage = async (..._args: any[]) => undefined;
export const assertWithinQuota = async (..._args: any[]) => undefined;
export const getSecret = async (name: string) => process.env[name] ?? "";
export const getSecretSync = (name: string) => process.env[name] ?? "";
export const clearSecretsCache = () => undefined;
export const _resetBackendForTesting = () => undefined;
export const SECRET_TTL_MS = 60_000;
export class SecretNotFoundError extends Error {}
export class QuotaExceededError extends Error {
  name = "QuotaExceededError";
}
export const startOtel = () => undefined;
export const activeTraceId = () => undefined;
export const buildHealthBody = () => ({ status: "ok" });
export const makeHealthHandler = () => (_req: any, res: any) => res.json({ status: "ok" });
export const logger = {
  info: (..._a: any[]) => undefined,
  warn: (..._a: any[]) => undefined,
  error: (..._a: any[]) => undefined,
  debug: (..._a: any[]) => undefined,
  child: () => logger,
};
export const timeVendorCall = async (...args: any[]) => {
  const fn = args[args.length - 1];
  return typeof fn === "function" ? fn() : undefined;
};
export const setCircuitBreakerState = (..._args: any[]) => undefined;
export const incVendorFailure = (..._args: any[]) => undefined;
export const incVendorSuccess = (..._args: any[]) => undefined;
export const httpRequestDuration = { observe: () => undefined };
export class EnvSecretBackend {}
export class AwsSecretsManagerBackend {}
export default prisma;
