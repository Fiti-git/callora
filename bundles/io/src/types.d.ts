declare module "@callora/calling-service/dist/app.js" {
  import type { Express } from "express";
  export function mountVapiWebhook(app: Express): void;
  export function mountCallingRoutes(app: Express): void;
  export function createApp(): Express;
}
declare module "@callora/billing-service/dist/app.js" {
  import type { Express } from "express";
  export function mountStripeWebhook(app: Express): void;
  export function mountBillingRoutes(app: Express): void;
  export function createApp(): Express;
}
declare module "@callora/notification-service/dist/app.js" {
  import type { Express } from "express";
  export function createApp(): Express;
}
declare module "@callora/calling-service/dist/workers/numbersWorker.js" {
  export function startNumbersWorker(): unknown;
  export function scheduleWeeklyPoolRotation(): Promise<void>;
}
declare module "@callora/billing-service/dist/workers/index.js" {}
declare module "@callora/notification-service/dist/workers/index.js" {}
