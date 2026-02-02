import { NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";
import { getProviderAnalytics } from "@/lib/analytics";

const prisma = new PrismaClient();

export async function GET(request: Request, { params }: { params: { providerId: string } }) {
  const { providerId } = await Promise.resolve(params);

  if (!providerId) {
    return NextResponse.json({ error: "providerId is required" }, { status: 400 });
  }

  const providerIdNum = parseInt(providerId, 10);
  if (Number.isNaN(providerIdNum)) {
    return NextResponse.json({ error: "invalid providerId" }, { status: 400 });
  }

  try {
    const analytics = await getProviderAnalytics(prisma, providerIdNum);
    return NextResponse.json(analytics);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Analytics error:", message || error);
    const msg = message.includes("column \"provider_id\"") || message.includes("Unknown arg \"provider_id\"")
      ? "Database schema does not include `provider_id` on `media`. Add a provider_id column to link media to content providers."
      : "Internal server error while computing analytics.";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
