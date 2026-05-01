// Service packages don't emit `.d.ts` files. Declare their compiled
// subpaths as `any` so the bundle compiles. Runtime resolution is fine
// because the workspace symlinks @callora/<svc> to services/<svc>/.
declare module "@callora/auth-service/dist/app.js" {
  import type { Express, Router } from "express";
  export function createApp(): Express;
  export const authRouter: Router;
  export const developerKeysRouter: Router;
  export const meRouter: Router;
  export const auditLogRouter: Router;
}
declare module "@callora/platform-service/dist/app.js" {
  import type { Express } from "express";
  export function createApp(): Express;
}
declare module "@callora/api-gateway/dist/middleware/tenantAuth.js" {
  import type { RequestHandler } from "express";
  const tenantAuth: RequestHandler;
  export default tenantAuth;
}
