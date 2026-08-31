import { NextRequest, NextResponse } from "next/server";
import { getUserDataFromToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PayoutError,
  disbursePayout,
  getPayoutBalance,
  serialisePayout,
  verifyPayout,
} from "@/lib/payouts";
import { FlutterwaveError, assertFlutterwaveConfigured } from "@/lib/flutterwave";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// One payout of the signed-in creator's.
//
//   POST — send an approved payout to their mobile money wallet.
//   GET  — re-read it at Flutterwave; what the page polls while it is in flight.
//
// Both are scoped to the owner, so a creator can neither send nor read anybody
// else's payout.

const noStore = <T,>(body: T, status = 200) => {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return response;
};

async function resolve(params: Promise<{ id: string }>) {
  const user = await getUserDataFromToken();
  if (!user || user.role !== "ContentCreator") {
    return { error: noStore({ error: "Unauthorized" }, 403) } as const;
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return { error: noStore({ error: "Unknown payout." }, 400) } as const;
  }

  return { providerId: BigInt(user.userId), payoutId: BigInt(id) } as const;
}

/** The payout row plus the creator's balance, which every answer here refreshes. */
async function payoutState(providerId: bigint, payoutId: bigint) {
  const [payout, balance] = await Promise.all([
    prisma.payouts.findUnique({ where: { payout_id: payoutId } }),
    getPayoutBalance(providerId),
  ]);
  return { payout: payout ? serialisePayout(payout) : null, ...balance };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await resolve(params);
  if ("error" in caller) return caller.error;

  try {
    const result = await verifyPayout({
      payoutId: caller.payoutId,
      providerId: caller.providerId,
    });

    return noStore({
      message: result.message,
      payoutStatus: result.status,
      transferStatus: result.transferStatus ?? null,
      ...(await payoutState(caller.providerId, caller.payoutId)),
    });
  } catch (error) {
    if (error instanceof PayoutError) return noStore({ error: error.message }, error.httpStatus);
    if (error instanceof FlutterwaveError) {
      return noStore({ error: error.message }, error.httpStatus);
    }
    console.error("Provider payout verify error:", error);
    return noStore({ error: "Could not check that payout right now." }, 500);
  }
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await resolve(params);
  if ("error" in caller) return caller.error;

  try {
    assertFlutterwaveConfigured();

    const result = await disbursePayout({
      payoutId: caller.payoutId,
      providerId: caller.providerId,
    });

    return noStore({
      message: result.message,
      payoutStatus: result.status,
      transferStatus: result.transferStatus ?? null,
      ...(await payoutState(caller.providerId, caller.payoutId)),
    });
  } catch (error) {
    if (error instanceof PayoutError) return noStore({ error: error.message }, error.httpStatus);
    if (error instanceof FlutterwaveError) {
      // The row has already been put back to `approved` or moved to `failed` by
      // disbursePayout — send the creator the current state along with the why.
      return noStore(
        {
          error: error.message,
          ...(await payoutState(caller.providerId, caller.payoutId)),
        },
        error.httpStatus
      );
    }
    console.error("Provider payout disburse error:", error);
    return noStore({ error: "Could not send that payout right now." }, 500);
  }
}
