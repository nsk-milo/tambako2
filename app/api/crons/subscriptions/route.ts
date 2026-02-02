import { PrismaClient } from "@/lib/generated/prisma"
import { NextResponse } from "next/server"

const prisma = new PrismaClient()

export async function POST(request: Request) {
  // For Vercel Cron Jobs, you can secure this endpoint by checking the
  // x-vercel-cron-secret header.
  const cronSecret = request.headers.get("x-vercel-cron-secret")
  if (process.env.VERCEL_CRON_SECRET && cronSecret !== process.env.VERCEL_CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const now = new Date()

    // Find all active subscriptions that have expired
    const expiredSubscriptions = await prisma.user_subscriptions.findMany({
      where: {
        is_active: true,
        end_date: {
          lt: now, // less than the current date
        },
      },
    })

    if (expiredSubscriptions.length === 0) {
      return NextResponse.json({ message: "No expired subscriptions to process." })
    }

    const expiredSubscriptionIds = expiredSubscriptions.map((sub) => sub.user_subscription_id)

    // Deactivate the expired subscriptions
    const { count } = await prisma.user_subscriptions.updateMany({
      where: {
        user_subscription_id: {
          in: expiredSubscriptionIds,
        },
      },
      data: {
        is_active: false,
      },
    })

    console.log(`Successfully deactivated ${count} expired subscriptions.`)

    return NextResponse.json({ message: `Successfully processed subscriptions. Deactivated ${count} subscriptions.` })
  } catch (error) {
    console.error("Cron job for subscriptions failed:", error)
    return NextResponse.json({ error: "Failed to process subscriptions" }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

