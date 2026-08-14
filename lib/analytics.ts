import { PrismaClient } from "@/lib/generated/prisma";
import { VIEW_PAYOUT_AMOUNT, monthKey } from "@/lib/views";

type ProviderAnalyticsItem = {
  id: string;
  title: string;
  duration: number | null;
  /** Qualifying views all-time — see `lib/views.ts` for what earns one. */
  totalViews: number;
  /** Qualifying views this calendar month. */
  monthlyViews: number;
  /** Distinct viewers who have ever earned this title a view. */
  uniqueViews: number;
  minutesConsumed: number;
  monthlyMinutes: number;
  revenueEarned: number;
  monthlyEarnings: number;
};

type ProviderPerformance = {
  providerId: string;
  providerName: string | null;
  providerEmail: string | null;
  totalViews: number;
  monthlyViews: number;
  uniqueViews: number;
  minutesConsumed: number;
  monthlyMinutes: number;
  revenueEarned: number;
  monthlyRevenueEarned: number;
  items: ProviderAnalyticsItem[];
};

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const endOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

const round2 = (value: number) => Number(value.toFixed(2));

export async function getRevenueSummary(prisma: PrismaClient, now = new Date()) {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const month = monthKey(now);

  const [totalRevenueAgg, monthlyRevenueAgg, payoutsAgg, monthlyPayoutsAgg] =
    await Promise.all([
      prisma.transactions.aggregate({ _sum: { amount: true } }),
      prisma.transactions.aggregate({
        _sum: { amount: true },
        where: { created_at: { gte: monthStart, lte: monthEnd } },
      }),
      // What creators have earned per view, which is what the platform owes
      // them — as opposed to the notional 50% share below.
      prisma.media_views.aggregate({ _sum: { payout_amount: true }, _count: true }),
      prisma.media_views.aggregate({
        _sum: { payout_amount: true },
        _count: true,
        where: { month },
      }),
    ]);

  const totalRevenue = Number(totalRevenueAgg._sum.amount || 0);
  const monthlyRevenue = Number(monthlyRevenueAgg._sum.amount || 0);

  return {
    totalRevenue,
    monthlyRevenue,
    adminShareTotal: totalRevenue * 0.5,
    adminShareMonthly: monthlyRevenue * 0.5,
    providerShareTotal: totalRevenue * 0.5,
    providerShareMonthly: monthlyRevenue * 0.5,
    creatorPayoutsTotal: round2(Number(payoutsAgg._sum.payout_amount || 0)),
    creatorPayoutsMonthly: round2(Number(monthlyPayoutsAgg._sum.payout_amount || 0)),
    qualifyingViewsTotal: payoutsAgg._count,
    qualifyingViewsMonthly: monthlyPayoutsAgg._count,
    viewPayoutRate: VIEW_PAYOUT_AMOUNT,
  };
}

export async function getSubscriptionActivity(prisma: PrismaClient) {
  const [activeSubscriptions, inactiveSubscriptions] = await Promise.all([
    prisma.user_subscriptions.count({ where: { is_active: true } }),
    prisma.user_subscriptions.count({ where: { is_active: false } }),
  ]);

  const subscriptionBreakdown = await prisma.user_subscriptions.groupBy({
    by: ["subscription_id"],
    _count: { subscription_id: true },
    where: { is_active: true },
  });

  const subscriptionPlans = await prisma.subscriptions.findMany({
    where: {
      subscription_id: {
        in: subscriptionBreakdown.map((row) => row.subscription_id),
      },
    },
  });

  const planMap = new Map(
    subscriptionPlans.map((plan) => [plan.subscription_id, plan])
  );

  const subscriptionActivity = subscriptionBreakdown.map((row) => {
    const plan = planMap.get(row.subscription_id);
    return {
      subscription_id: row.subscription_id,
      type: plan?.type ?? "Unknown",
      count: row._count.subscription_id,
    };
  });

  return {
    active: activeSubscriptions,
    inactive: inactiveSubscriptions,
    subscriptionBreakdown: subscriptionActivity,
  };
}

interface MediaStats {
  totalViews: number;
  monthlyViews: number;
  uniqueViews: number;
  minutesConsumed: number;
  monthlyMinutes: number;
  revenueEarned: number;
  monthlyEarnings: number;
}

const emptyStats = (): MediaStats => ({
  totalViews: 0,
  monthlyViews: 0,
  uniqueViews: 0,
  minutesConsumed: 0,
  monthlyMinutes: 0,
  revenueEarned: 0,
  monthlyEarnings: 0,
});

/**
 * Views, watch time and earnings for a set of titles, in a handful of queries
 * rather than a handful per title.
 *
 * Views and earnings come from `media_views` — the rows that were actually
 * earned. Watch time still comes from the raw history, counting each viewer's
 * furthest point in a title once: the tracker appends a row every few seconds,
 * so summing every row would multiply the same minutes over and over.
 */
async function getMediaStats(
  prisma: PrismaClient,
  mediaIds: bigint[],
  now: Date
): Promise<Map<string, MediaStats>> {
  const stats = new Map<string, MediaStats>(
    mediaIds.map((id) => [String(id), emptyStats()])
  );

  if (mediaIds.length === 0) return stats;

  const month = monthKey(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [viewRows, historyRows, monthlyHistoryRows] = await Promise.all([
    prisma.media_views.findMany({
      where: { media_id: { in: mediaIds } },
      select: { media_id: true, user_id: true, month: true, payout_amount: true },
    }),
    prisma.watch_history.groupBy({
      by: ["media_id", "user_id"],
      where: { media_id: { in: mediaIds } },
      _max: { progress: true },
    }),
    prisma.watch_history.groupBy({
      by: ["media_id", "user_id"],
      where: {
        media_id: { in: mediaIds },
        watched_at: { gte: monthStart, lte: monthEnd },
      },
      _max: { progress: true },
    }),
  ]);

  const viewers = new Map<string, Set<string>>();

  for (const row of viewRows) {
    const key = String(row.media_id);
    const entry = stats.get(key);
    if (!entry) continue;

    const payout = Number(row.payout_amount);
    entry.totalViews += 1;
    entry.revenueEarned += payout;

    if (row.month === month) {
      entry.monthlyViews += 1;
      entry.monthlyEarnings += payout;
    }

    if (!viewers.has(key)) viewers.set(key, new Set());
    viewers.get(key)!.add(String(row.user_id));
  }

  for (const [key, entry] of stats) {
    entry.uniqueViews = viewers.get(key)?.size ?? 0;
  }

  for (const row of historyRows) {
    const entry = row.media_id ? stats.get(String(row.media_id)) : undefined;
    if (entry) entry.minutesConsumed += Number(row._max.progress || 0) / 60;
  }

  for (const row of monthlyHistoryRows) {
    const entry = row.media_id ? stats.get(String(row.media_id)) : undefined;
    if (entry) entry.monthlyMinutes += Number(row._max.progress || 0) / 60;
  }

  return stats;
}

export async function getProviderPerformance(
  prisma: PrismaClient,
  // Kept in the signature so callers need not change; creator earnings no
  // longer come out of the subscription split, they are paid per view.
  _revenueSummary?: Awaited<ReturnType<typeof getRevenueSummary>>
) {
  const now = new Date();

  const providers = await prisma.users.findMany({
    where: { role: { name: "ContentCreator" } },
    select: {
      user_id: true,
      name: true,
      email: true,
      provided_media: {
        select: { media_id: true, title: true, duration: true },
      },
    },
  });

  const mediaIds = providers.flatMap((provider) =>
    provider.provided_media.map((item) => item.media_id)
  );
  const stats = await getMediaStats(prisma, mediaIds, now);

  let totalPlatformMinutes = 0;
  let totalPlatformMonthlyMinutes = 0;

  const providerPerformance: ProviderPerformance[] = providers.map((provider) => {
    const items: ProviderAnalyticsItem[] = provider.provided_media.map((mediaItem) => {
      const itemStats = stats.get(String(mediaItem.media_id)) ?? emptyStats();

      return {
        id: String(mediaItem.media_id),
        title: mediaItem.title,
        duration: mediaItem.duration,
        totalViews: itemStats.totalViews,
        monthlyViews: itemStats.monthlyViews,
        uniqueViews: itemStats.uniqueViews,
        minutesConsumed: round2(itemStats.minutesConsumed),
        monthlyMinutes: round2(itemStats.monthlyMinutes),
        revenueEarned: round2(itemStats.revenueEarned),
        monthlyEarnings: round2(itemStats.monthlyEarnings),
      };
    });

    const sum = (pick: (item: ProviderAnalyticsItem) => number) =>
      items.reduce((total, item) => total + pick(item), 0);

    const minutesConsumed = sum((item) => item.minutesConsumed);
    const monthlyMinutes = sum((item) => item.monthlyMinutes);

    totalPlatformMinutes += minutesConsumed;
    totalPlatformMonthlyMinutes += monthlyMinutes;

    return {
      providerId: String(provider.user_id),
      providerName: provider.name,
      providerEmail: provider.email,
      totalViews: sum((item) => item.totalViews),
      monthlyViews: sum((item) => item.monthlyViews),
      uniqueViews: sum((item) => item.uniqueViews),
      minutesConsumed: round2(minutesConsumed),
      monthlyMinutes: round2(monthlyMinutes),
      revenueEarned: round2(sum((item) => item.revenueEarned)),
      monthlyRevenueEarned: round2(sum((item) => item.monthlyEarnings)),
      items,
    };
  });

  return {
    providerPerformance,
    totalPlatformMinutes,
    totalPlatformMonthlyMinutes,
  };
}

export async function getAdminAnalytics(prisma: PrismaClient) {
  const [revenue, userActivity] = await Promise.all([
    getRevenueSummary(prisma),
    getSubscriptionActivity(prisma),
  ]);
  const { providerPerformance } = await getProviderPerformance(prisma, revenue);

  return {
    revenue,
    userActivity,
    providerPerformance,
  };
}

export async function getProviderAnalytics(
  prisma: PrismaClient,
  providerId: number
) {
  const { providerPerformance } = await getProviderPerformance(prisma);
  const provider = providerPerformance.find(
    (item) => item.providerId === String(providerId)
  );

  if (!provider || provider.items.length === 0) {
    return {
      analytics: [] as ProviderAnalyticsItem[],
      providerTotals: {
        providerTotalMinutes: 0,
        providerMonthlyMinutes: 0,
        providerShareTotal: 0,
        providerShareMonthly: 0,
        totalViews: 0,
        monthlyViews: 0,
        viewPayoutRate: VIEW_PAYOUT_AMOUNT,
      },
      message:
        "No media found for this provider (ensure media.provider_id exists).",
    };
  }

  return {
    analytics: provider.items,
    providerTotals: {
      providerTotalMinutes: provider.minutesConsumed,
      providerMonthlyMinutes: provider.monthlyMinutes,
      // Earnings, at the per-view rate — the name is kept for the dashboard and
      // withdrawal code that reads it.
      providerShareTotal: provider.revenueEarned,
      providerShareMonthly: provider.monthlyRevenueEarned,
      totalViews: provider.totalViews,
      monthlyViews: provider.monthlyViews,
      viewPayoutRate: VIEW_PAYOUT_AMOUNT,
    },
  };
}
