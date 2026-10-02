// =============================================================================
// Prisma Client — global singleton (Node.js / serverless / Docker orchestrator)
// -----------------------------------------------------------------------------
// Prevents connection-pool exhaustion during hot-reload and serverless cold
// starts by caching the client on `globalThis` outside of production.
// =============================================================================

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  __portalPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
}

export const prisma: PrismaClient =
  globalForPrisma.__portalPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__portalPrisma = prisma;
}

/** Verify the cloud plane is reachable before an orchestration cycle begins. */
export async function assertCloudConnected(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

/** Gracefully drain the pool (call on SIGTERM / container shutdown). */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

export default prisma;
