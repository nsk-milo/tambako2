import { NextResponse } from "next/server";
import { getUserDataFromToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PayoutError,
  getPayoutBalance,
  requestPayout,
  serialisePayout,
} from "@/lib/payouts";
import { FLW_NETWORKS } from "@/lib/flutterwave";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// A creator's own payouts: what they can cash out, what they have asked for,
// and the request that starts a new one. Approving and sending happen
// elsewhere — see /api/admin/payouts and /api/provider/payouts/[id].

const noStore = <T,>(body: T, status = 200) => {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return response;
};

/** The signed-in creator, or the response that says why there isn't one. */
async function requireCreator() {
  const user = await getUserDataFromToken();
  if (!user || user.role !== "ContentCreator") {
    return { error: noStore({ error: "Unauthorized" }, 403) } as const;
  }
  return { providerId: BigInt(user.userId) } as const;
}

export async function GET() {
  const caller = await requireCreator();
  if ("error" in caller) return caller.error;

  try {
    const [balance, payouts, account] = await Promise.all([
      getPayoutBalance(caller.providerId),
      prisma.payouts.findMany({
        where: { provider_id: caller.providerId },
        orderBy: { created_at: "desc" },
        take: 20,
      }),
      prisma.users.findUnique({
        where: { user_id: caller.providerId },
        select: { name: true, phone_number: true },
      }),
    ]);

    return noStore({
      ...balance,
      networks: FLW_NETWORKS,
      // Prefills the request form; the creator can pay a different wallet.
      defaults: {
        accountName: account?.name ?? "",
        phoneNumber: account?.phone_number ?? "",
      },
      payouts: payouts.map((payout) => serialisePayout(payout)),
    });
  } catch (error) {
    console.error("Provider payout summary error:", error);
    return noStore({ error: "Failed to load your payout balance." }, 500);
  }
}

export async function POST(request: Request) {
  const caller = await requireCreator();
  if ("error" in caller) return caller.error;

  try {
    const body = (await request.json()) as {
      amount?: number | string;
      phoneNumber?: string;
      network?: string;
      accountName?: string;
    };

    const payout = await requestPayout({
      providerId: caller.providerId,
      amount: typeof body.amount === "string" ? Number(body.amount) : Number(body.amount),
      phoneNumber: body.phoneNumber?.trim() || "",
      network: body.network?.trim().toUpperCase() || "",
      accountName: body.accountName?.trim() || "",
    });

    const balance = await getPayoutBalance(caller.providerId);

    return noStore(
      {
        message:
          "Payout requested. An admin will review it, and you can send it to your wallet once it is approved.",
        payout: serialisePayout(payout),
        ...balance,
      },
      201
    );
  } catch (error) {
    if (error instanceof PayoutError) {
      return noStore({ error: error.message }, error.httpStatus);
    }
    console.error("Provider payout request error:", error);
    return noStore({ error: "Failed to submit your payout request." }, 500);
  }
}
