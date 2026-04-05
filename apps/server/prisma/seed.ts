import { PrismaClient } from '@prisma/client'
import { universities } from './seeds/universities'

const prisma = new PrismaClient()

// Fixed UUID for the system seed user — used as `createdBy` for all seeded orgs.
// This user has no usable password and is never surfaced via the API.
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * Converts a university name into a URL-safe handle suffix.
 * e.g. "Howard University" → "howard-university"
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) // leave room for the 4-char "tcu-" / "abc-" prefix
}

async function main() {
  // ── 1. Upsert system seed user ─────────────────────────────────────────────
  await prisma.user.upsert({
    where: { id: SYSTEM_USER_ID },
    update: {},
    create: {
      id: SYSTEM_USER_ID,
      email: 'seed@portal.internal',
      password: 'NOT_A_REAL_PASSWORD_DO_NOT_USE',
      username: 'system',
      displayName: 'System',
      role: 'super_admin',
    },
  })
  console.log('Upserted system seed user')

  // ── 2. Seed universities ───────────────────────────────────────────────────
  await prisma.university.createMany({
    data: universities,
    skipDuplicates: true,
  })
  console.log(`Seeded ${universities.length} universities`)

  // ── 3. Create global (umbrella) TCU and ABC ────────────────────────────────
  // These have no universityId and no parentOrgId — they are the top-level orgs.
  const [globalTCU, globalABC] = await Promise.all([
    prisma.organization.upsert({
      where: { handle: 'true-culture-university' },
      update: {},
      create: {
        name: 'True Culture University',
        handle: 'true-culture-university',
        description: 'The global home for authentic cultural expression across every campus.',
        type: 'panafrican',
        visibility: 'open',
        createdBy: SYSTEM_USER_ID,
      },
    }),
    prisma.organization.upsert({
      where: { handle: 'afrika-black-coalition' },
      update: {},
      create: {
        name: 'Afrika Black Coalition',
        handle: 'afrika-black-coalition',
        description: 'Uniting the African diaspora across every university in the world.',
        type: 'panafrican',
        visibility: 'open',
        createdBy: SYSTEM_USER_ID,
      },
    }),
  ])
  console.log(`Upserted umbrella orgs: ${globalTCU.handle}, ${globalABC.handle}`)

  // ── 4. Seed chapter orgs per university ────────────────────────────────────
  const allUniversities = await prisma.university.findMany({
    select: { id: true, name: true },
  })

  let orgCount = 0
  for (const uni of allUniversities) {
    const slug = slugify(uni.name)

    await prisma.organization.upsert({
      where: { handle: `tcu-${slug}` },
      update: {},
      create: {
        name: 'True Culture University',
        handle: `tcu-${slug}`,
        description: `TCU chapter at ${uni.name}.`,
        type: 'panafrican',
        visibility: 'open',
        universityId: uni.id,
        parentOrgId: globalTCU.id,
        createdBy: SYSTEM_USER_ID,
      },
    })

    await prisma.organization.upsert({
      where: { handle: `abc-${slug}` },
      update: {},
      create: {
        name: 'Afrika Black Coalition',
        handle: `abc-${slug}`,
        description: `ABC chapter at ${uni.name}.`,
        type: 'panafrican',
        visibility: 'open',
        universityId: uni.id,
        parentOrgId: globalABC.id,
        createdBy: SYSTEM_USER_ID,
      },
    })

    orgCount += 2
  }

  console.log(
    `Seeded ${orgCount} chapter orgs (TCU + ABC for each of ${allUniversities.length} universities)`,
  )
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
