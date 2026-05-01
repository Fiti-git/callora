import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    client.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[api-gateway] redis error:", err.message);
    });
  }
  return client;
}
