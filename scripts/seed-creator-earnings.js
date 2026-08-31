#!/usr/bin/env node
/**
 * Gives a content creator earnings to cash out, so the payout flow can be
 * exercised end to end without waiting for real viewers.
 *
 * Creator earnings are not a stored balance — they are the sum of
 * `media_views.payout_amount` over the titles a creator owns (see
 * lib/analytics.ts). So the only way to move the number is to write view rows,
 * which is what this does.
 *
 * Two constraints shape how the rows come out:
 *
 *  - `media.provider_id` is what attributes a title to a creator. A view on a
 *    title somebody else owns earns them nothing.
 *  - `media_views` is unique on (viewer, title, month), so N views need N
 *    distinct viewer-month pairs. Extra test viewers are created as needed.
 *
 * `payout_amount` is stamped per row rather than derived, so the seeded rate
 * can be anything — real views are worth K0.08 (lib/views.ts), but pricing 25
 * seeded views at K20 each gets to a testable balance without writing 6,250
 * rows.
 *
 * Usage:
 *   npm run seed:earnings -- --amount 500
 *   npm run seed:earnings -- --email me@example.com --amount 1200 --views 40
 *   npm run seed:earnings -- --reset                       # clear and re-seed
 *
 * Reads DATABASE_URL from .env, so `npm run seed:earnings -- --amount 500` works
 * without sourcing anything first.
 */

const fs = require("fs");
const path = require("path");

// Next.js loads .env on its own; a bare node script does not, and npm passes
// nothing through either. Parse the few lines we need rather than adding a
// dependency for it.
function loadEnv() {
  const file = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

loadEnv();

const bcrypt = require("bcrypt");
const { PrismaClient, Prisma } = require("../lib/generated/prisma");

const prisma = new PrismaClient();

/* -------------------------------------------------------------------------- */
/* Arguments                                                                   */
/* -------------------------------------------------------------------------- */

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const CONFIG = {
  email: String(args.email || "creator@tambako.test").toLowerCase(),
  password: String(args.password || "password123"),
  name: String(args.name || "Test Creator"),
  phone: String(args.phone || "260966123456"),
  /** Total ZMW to credit the creator with. */
  amount: Number(args.amount || 500),
  /** How many view rows that total is spread over. */
  views: Number(args.views || 25),
  /** How far back to spread them, in calendar months. */
  months: Number(args.months || 12),
  /** Attribute to this existing title instead of creating one. */
  mediaId: args["media-id"] ? BigInt(args["media-id"]) : null,
  /** Wipe this creator's seeded views and payouts first. */
  reset: Boolean(args.reset),
};

if (!Number.isFinite(CONFIG.amount) || CONFIG.amount <= 0) {
  console.error("--amount must be a positive number of Kwacha.");
  process.exit(1);
}
if (!Number.isInteger(CONFIG.views) || CONFIG.views < 1) {
  console.error("--views must be a positive whole number.");
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** The calendar month `back` months before now, as `YYYY-MM`. Matches lib/views.ts. */
function monthKey(back = 0) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const kwacha = (value) => `K${Number(value).toFixed(2)}`;

/**
 * Splits `total` into `count` parts of 2dp that add back up to exactly `total` —
 * the remainder goes on the last row rather than being rounded away, so the
 * seeded balance matches what was asked for to the ngwee.
 */
function splitAmount(total, count) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const parts = Array.from({ length: count }, () => base);
  parts[count - 1] += cents - base * count;
  return parts.map((value) => value / 100);
}

/* -------------------------------------------------------------------------- */
/* Seeding                                                                     */
/* -------------------------------------------------------------------------- */

/** The creator account, created with the ContentCreator role if it is missing. */
async function ensureCreator() {
  const existing = await prisma.users.findUnique({
    where: { email: CONFIG.email },
    include: { role: true },
  });

  const creatorRole = await prisma.role.findFirst({ where: { name: "ContentCreator" } });
  if (!creatorRole) {
    throw new Error("No ContentCreator role in the database — seed the roles table first.");
  }

  if (existing) {
    // An account that is not a creator earns nothing: getProviderPerformance
    // only looks at users holding the ContentCreator role.
    if (existing.role?.name !== "ContentCreator") {
      await prisma.users.update({
        where: { user_id: existing.user_id },
        data: { roleId: creatorRole.id },
      });
      console.log(`Promoted ${CONFIG.email} to ContentCreator.`);
    }
    return existing;
  }

  const created = await prisma.users.create({
    data: {
      name: CONFIG.name,
      email: CONFIG.email,
      phone_number: CONFIG.phone,
      password_hash: await bcrypt.hash(CONFIG.password, 10),
      roleId: creatorRole.id,
    },
  });

  console.log(`Created creator ${CONFIG.email} / ${CONFIG.password} (user_id ${created.user_id}).`);
  return created;
}

/** A title owned by the creator — earnings attach to titles, not to people. */
async function ensureMedia(creatorId) {
  if (CONFIG.mediaId) {
    const media = await prisma.media.findUnique({ where: { media_id: CONFIG.mediaId } });
    if (!media) throw new Error(`No media with id ${CONFIG.mediaId}.`);

    if (media.provider_id !== creatorId) {
      await prisma.media.update({
        where: { media_id: media.media_id },
        data: { provider_id: creatorId },
      });
      console.log(`Reassigned "${media.title}" to the creator.`);
    }
    return media;
  }

  const owned = await prisma.media.findFirst({ where: { provider_id: creatorId } });
  if (owned) return owned;

  const category =
    (await prisma.categories.findFirst({ where: { name: "movies" } })) ??
    (await prisma.categories.findFirst());
  if (!category) throw new Error("No categories in the database — seed those first.");

  const media = await prisma.media.create({
    data: {
      title: "Seeded Test Title",
      description: "Created by scripts/seed-creator-earnings.js",
      category_id: category.category_id,
      duration: 120,
      media_location: "seed/placeholder.mp4",
      provider_id: creatorId,
    },
  });

  console.log(`Created title "${media.title}" (media_id ${media.media_id}) for the creator.`);
  return media;
}

/**
 * Enough viewer accounts to fit `views` rows inside `months`, given one row per
 * viewer per title per month. Existing accounts are reused before new ones are
 * invented.
 */
async function ensureViewers(needed) {
  const existing = await prisma.users.findMany({
    orderBy: { user_id: "asc" },
    select: { user_id: true },
  });

  const viewers = existing.map((user) => user.user_id);
  if (viewers.length >= needed) return viewers.slice(0, needed);

  const viewerRole = await prisma.role.findFirst({ where: { name: "USER" } });
  const passwordHash = await bcrypt.hash("password123", 10);

  for (let i = viewers.length; i < needed; i += 1) {
    const created = await prisma.users.create({
      data: {
        name: `Test Viewer ${i + 1}`,
        email: `viewer${i + 1}@tambako.test`,
        phone_number: `26095${String(1000000 + i).slice(-7)}`,
        password_hash: passwordHash,
        roleId: viewerRole?.id ?? null,
      },
    });
    viewers.push(created.user_id);
  }

  console.log(`Using ${viewers.length} viewer account(s).`);
  return viewers;
}

/** Clears what an earlier run of this script left behind for the creator. */
async function reset(creatorId) {
  const media = await prisma.media.findMany({
    where: { provider_id: creatorId },
    select: { media_id: true },
  });
  const mediaIds = media.map((row) => row.media_id);

  const [views, payouts] = await Promise.all([
    mediaIds.length
      ? prisma.media_views.deleteMany({ where: { media_id: { in: mediaIds } } })
      : { count: 0 },
    prisma.payouts.deleteMany({ where: { provider_id: creatorId } }),
  ]);

  console.log(`Reset: removed ${views.count} view(s) and ${payouts.count} payout(s).`);
}

async function main() {
  const creator = await ensureCreator();

  if (CONFIG.reset) await reset(creator.user_id);

  const media = await ensureMedia(creator.user_id);

  // One row per viewer per title per month is the unique key, so the rows have
  // to be laid out across both axes.
  const viewersNeeded = Math.min(CONFIG.views, Math.ceil(CONFIG.views / CONFIG.months));
  const viewers = await ensureViewers(Math.max(viewersNeeded, 1));

  const amounts = splitAmount(CONFIG.amount, CONFIG.views);
  const rows = [];

  for (let i = 0; i < CONFIG.views; i += 1) {
    // Fill the current month first, so the dashboard's monthly figure is not
    // zero while the all-time one is large.
    const viewer = viewers[i % viewers.length];
    const back = Math.floor(i / viewers.length);

    rows.push({
      user_id: viewer,
      media_id: media.media_id,
      provider_id: creator.user_id,
      month: monthKey(back),
      seconds_watched: 600,
      payout_amount: new Prisma.Decimal(amounts[i].toFixed(2)),
    });
  }

  // skipDuplicates so a re-run without --reset tops up rather than blowing up
  // on the unique index.
  const { count } = await prisma.media_views.createMany({ data: rows, skipDuplicates: true });

  const total = await prisma.media_views.aggregate({
    _sum: { payout_amount: true },
    _count: true,
    where: { media_id: media.media_id },
  });

  console.log(
    `\nSeeded ${count} view row(s) worth ${kwacha(CONFIG.amount)}.\n` +
      `${CONFIG.email} now has ${total._count} qualifying view(s) ` +
      `totalling ${kwacha(total._sum.payout_amount || 0)}.\n\n` +
      `Log in as ${CONFIG.email} / ${CONFIG.password} and open /content-provider.`
  );

  if (count < rows.length) {
    console.log(
      `(${rows.length - count} row(s) already existed — pass --reset to start clean.)`
    );
  }
}

main()
  .catch((error) => {
    console.error("\nSeed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
