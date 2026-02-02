import { PrismaClient } from "@/lib/generated/prisma";

type ProviderAnalyticsItem = {
  id: string;
  title: string;
  duration: number | null;
  totalViews: number;
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

export async function getRevenueSummary(prisma: PrismaClient, now = new Date()) {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [totalRevenueAgg, monthlyRevenueAgg] = await Promise.all([
    prisma.transactions.aggregate({ _sum: { amount: true } }),
    prisma.transactions.aggregate({
      _sum: { amount: true },
      where: { created_at: { gte: monthStart, lte: monthEnd } },
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

async function getMediaStats(
  prisma: PrismaClient,
  mediaId: bigint,
  monthStart: Date,
  monthEnd: Date
) {
  const [totalViews, uniqueRows, minutesAgg, monthlyMinutesAgg] =
    await Promise.all([
      prisma.watch_history.count({ where: { media_id: mediaId } }),
      prisma.watch_history.findMany({
        where: { media_id: mediaId },
        select: { user_id: true },
      }),
      prisma.watch_history.aggregate({
        _sum: { progress: true },
        where: { media_id: mediaId },
      }),
      prisma.watch_history.aggregate({
        _sum: { progress: true },
        where: {
          media_id: mediaId,
          watched_at: { gte: monthStart, lte: monthEnd },
        },
      }),
    ]);

  const uniqueViews = new Set(uniqueRows.map((row) => String(row.user_id))).size;
  const totalProgress = Number(minutesAgg._sum.progress || 0);
  const monthlyProgress = Number(monthlyMinutesAgg._sum.progress || 0);

  const minutesConsumed = totalProgress > 0 ? totalProgress / 60 : 0;
  const monthlyMinutes = monthlyProgress > 0 ? monthlyProgress / 60 : 0;

  return {
    totalViews,
    uniqueViews,
    minutesConsumed,
    monthlyMinutes,
  };
}

export async function getProviderPerformance(
  prisma: PrismaClient,
  revenueSummary: Awaited<ReturnType<typeof getRevenueSummary>>
) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

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

  const providerAnalytics: ProviderPerformance[] = [];
  let totalPlatformMinutes = 0;
  let totalPlatformMonthlyMinutes = 0;

  for (const provider of providers) {
    let providerMinutes = 0;
    let providerMonthlyMinutes = 0;
    let providerViews = 0;
    let providerUniqueViews = 0;

    const items: ProviderAnalyticsItem[] = [];

    for (const mediaItem of provider.provided_media) {
      const stats = await getMediaStats(
        prisma,
        mediaItem.media_id,
        monthStart,
        monthEnd
      );

      providerMinutes += stats.minutesConsumed;
      providerMonthlyMinutes += stats.monthlyMinutes;
      providerViews += stats.totalViews;
      providerUniqueViews += stats.uniqueViews;

      items.push({
        id: String(mediaItem.media_id),
        title: mediaItem.title,
        duration: mediaItem.duration,
        totalViews: stats.totalViews,
        uniqueViews: stats.uniqueViews,
        minutesConsumed: Number(stats.minutesConsumed.toFixed(2)),
        monthlyMinutes: Number(stats.monthlyMinutes.toFixed(2)),
        revenueEarned: 0,
        monthlyEarnings: 0,
      });
    }

    totalPlatformMinutes += providerMinutes;
    totalPlatformMonthlyMinutes += providerMonthlyMinutes;

    providerAnalytics.push({
      providerId: String(provider.user_id),
      providerName: provider.name,
      providerEmail: provider.email,
      totalViews: providerViews,
      uniqueViews: providerUniqueViews,
      minutesConsumed: Number(providerMinutes.toFixed(2)),
      monthlyMinutes: Number(providerMonthlyMinutes.toFixed(2)),
      revenueEarned: 0,
      monthlyRevenueEarned: 0,
      items,
    });
  }

  const providerPerformance = providerAnalytics.map((provider) => {
    const providerShare =
      totalPlatformMinutes > 0
        ? revenueSummary.providerShareTotal *
          (provider.minutesConsumed / totalPlatformMinutes)
        : 0;
    const providerMonthlyShare =
      totalPlatformMonthlyMinutes > 0
        ? revenueSummary.providerShareMonthly *
          (provider.monthlyMinutes / totalPlatformMonthlyMinutes)
        : 0;

    const updatedItems = provider.items.map((item) => {
      const itemRevenue =
        provider.minutesConsumed > 0
          ? providerShare * (item.minutesConsumed / provider.minutesConsumed)
          : 0;
      const itemMonthly =
        provider.monthlyMinutes > 0
          ? providerMonthlyShare * (item.monthlyMinutes / provider.monthlyMinutes)
          : 0;

      return {
        ...item,
        revenueEarned: Number(itemRevenue.toFixed(2)),
        monthlyEarnings: Number(itemMonthly.toFixed(2)),
      };
    });

    return {
      ...provider,
      revenueEarned: Number(providerShare.toFixed(2)),
      monthlyRevenueEarned: Number(providerMonthlyShare.toFixed(2)),
      items: updatedItems,
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
  const revenue = await getRevenueSummary(prisma);
  const { providerPerformance } = await getProviderPerformance(prisma, revenue);
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
      providerShareTotal: provider.revenueEarned,
      providerShareMonthly: provider.monthlyRevenueEarned,
    },
  };
}