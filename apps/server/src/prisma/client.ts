import { PrismaClient } from '@prisma/client'

/**
 * Singleton PrismaClient instance.
 *
 * In development, Next.js / ts-node hot-reload would create a new PrismaClient
 * on every module re-evaluation, quickly exhausting the database connection pool.
 * Storing the instance on globalThis prevents that while keeping a single
 * instance across the lifetime of the process in production.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
