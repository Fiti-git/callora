declare module "@callora/campaign-service/dist/app.js" {
  import type { Express } from "express";
  export function createApp(): Express;
}
declare module "@callora/lead-service/dist/app.js" {
  import type { Express } from "express";
  export function createApp(): Express;
}
declare module "@callora/crm-service/dist/app.js" {
  import type { Express } from "express";
  export function createApp(): Express;
}
declare module "@callora/analytics-service/dist/app.js" {
  import type { Express } from "express";
  export function createApp(): Express;
}
declare module "@callora/campaign-service/dist/workers/index.js" {}
declare module "@callora/crm-service/dist/workers/index.js" {}
declare module "@callora/platform-service/dist/risk/anomalyWorker.js" {
  export function startAnomalyWorker(): unknown;
}
