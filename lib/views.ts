import { Prisma, PrismaClient } from "@/lib/generated/prisma";

// What a creator gets paid for, and when a play becomes worth paying for.
//
// A play only earns once the viewer has actually watched: two minutes of a
// music video, eight minutes of a film or an episode. Past that point the same
// viewer earns the creator nothing more for that title until the next calendar
// month — one view, per viewer, per title, per month.

/** What one qualifying view pays the creator, in ZMW. */
export const VIEW_PAYOUT_AMOUNT = 0.08;

/** Watch time a music title needs before it counts. */
export const MUSIC_VIEW_SECONDS = 2 * 60;

/** Watch time a film or series episode needs before it counts. */
export const VIDEO_VIEW_SECONDS = 8 * 60;

const SECONDS_PER_MINUTE = 60;

/**
 * How long this title has to be watched before the view counts.
 *
 * `durationMinutes` is the title's own length, as stored on the media row. A
 * title shorter than its category's threshold could otherwise never earn, so
 * for those the bar is watching the whole thing.
 */
export function viewThresholdSeconds(
  categoryName: string | null | undefined,
  durationMinutes?: number | null
): number {
  const base =
    categoryName?.trim().toLowerCase() === "music" ? MUSIC_VIEW_SECONDS : VIDEO_VIEW_SECONDS;

  const titleSeconds = Number(durationMinutes ?? 0) * SECONDS_PER_MINUTE;
  return titleSeconds > 0 && titleSeconds < base ? titleSeconds : base;
}

/** The calendar month a view belongs to, as `YYYY-MM`. */
export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** The last `count` month keys, most recent first. */
export function recentMonthKeys(count: number, from: Date = new Date()): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(from.getFullYear(), from.getMonth() - index, 1);
    return monthKey(date);
  });
}

export interface RecordViewResult {
  /** Whether the play has now been watched for long enough to earn. */
  qualified: boolean;
  /** True only on the play that first earned this month — what is paid for. */
  counted: boolean;
  thresholdSeconds: number;
  payout: number;
}

/**
 * Records a qualifying view, if this play has earned one.
 *
 * Called on every progress report, so it has to be cheap and idempotent: the
 * unique index on (viewer, title, month) is what enforces "once per month", and
 * a second report in the same month is simply ignored rather than paying twice.
 */
export async function recordQualifyingView(
  prisma: PrismaClient,
  {
    userId,
    mediaId,
    secondsWatched,
    now = new Date(),
  }: { userId: bigint; mediaId: bigint; secondsWatched: number; now?: Date }
): Promise<RecordViewResult> {
  const media = await prisma.media.findUnique({
    where: { media_id: mediaId },
    select: {
      provider_id: true,
      duration: true,
      categories: { select: { name: true } },
    },
  });

  const thresholdSeconds = viewThresholdSeconds(
    media?.categories?.name,
    media?.duration
  );

  const result: RecordViewResult = {
    qualified: false,
    counted: false,
    thresholdSeconds,
    payout: VIEW_PAYOUT_AMOUNT,
  };

  if (!media || secondsWatched < thresholdSeconds) return result;

  result.qualified = true;

  const month = monthKey(now);

  // `create` rather than `upsert`: the first qualifying play of the month is
  // the one that earns, and later ones must leave that row — and its stamped
  // payout — exactly as it was.
  try {
    await prisma.media_views.create({
      data: {
        user_id: userId,
        media_id: mediaId,
        provider_id: media.provider_id,
        month,
        seconds_watched: Math.floor(secondsWatched),
        payout_amount: new Prisma.Decimal(VIEW_PAYOUT_AMOUNT.toFixed(2)),
      },
    });
    result.counted = true;
  } catch (error) {
    // Already counted this month — the expected case for anyone rewatching.
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
  }

  return result;
}
