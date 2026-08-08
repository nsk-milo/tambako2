import { PrismaClient } from "@/lib/generated/prisma";

// A single PrismaClient reused across requests. Instantiating one per request
// (and calling $disconnect() in a finally block) exhausts the database
// connection pool under load and breaks between hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
