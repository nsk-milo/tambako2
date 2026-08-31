import { randomUUID } from "crypto";

// Server-only helpers for the Flutterwave v4 "Payment Orchestrator" flow.
// Docs: https://developer.flutterwave.com/docs/payment-orchestrator-flow
//
// The orchestrator combines customer creation and payment-method setup into a
// single direct-charge call, which is what we want for one-off subscription
// payments. We take no webhooks: a charge is only ever believed to have settled
// after `GET /charges/{id}` says so (see lib/payments.ts). Nothing in this file
// may be imported from a client component — the client secret must never reach
// the browser.

// Sandbox and production are separate environments with their own credentials;
// a charge created in one is invisible to the other. Default to sandbox so a
// missing env var can never take real money.
//   sandbox:    https://developersandbox-api.flutterwave.com
//   production: https://f4bexperience.flutterwave.com
// The docs print the production URL with a trailing slash; left on, every path
// below would be requested as `//orchestration/...`, so normalise it here
// rather than trusting whoever writes the env file to omit it.
const FLW_API_BASE_URL = (
  process.env.FLW_API_BASE_URL || "https://developersandbox-api.flutterwave.com"
).replace(/\/+$/, "");
const FLW_OAUTH_TOKEN_URL =
  process.env.FLW_OAUTH_TOKEN_URL ||
  "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";

const FLW_CLIENT_ID = process.env.FLW_CLIENT_ID || "";
const FLW_CLIENT_SECRET = process.env.FLW_CLIENT_SECRET || "";

/** Flutterwave settles per currency; our merchant account collects Kwacha. */
export const FLW_CURRENCY = process.env.FLW_CURRENCY || "ZMW";

/** Mobile money is the only channel we collect through. See the card note in the README. */
export const FLW_CHANNEL = "mobile_money";

/** Zambia. Used for both the MSISDN and the customer phone object. */
const ZM_COUNTRY_CODE = "260";

/** Networks Flutterwave settles ZMW mobile money through. */
export const FLW_NETWORKS = ["MTN", "AIRTEL", "ZAMTEL"] as const;
export type FlutterwaveNetwork = (typeof FLW_NETWORKS)[number];

/**
 * The network code payouts go out on.
 *
 * Collections name the carrier (MTN / AIRTEL / ZAMTEL); transfers do not — the
 * mobile money transfers table lists exactly one network per destination
 * currency, and for ZMW that is `MPS`, an aggregator that reaches all three
 * carriers. Sending "MTN" here is rejected outright.
 * https://developer.flutterwave.com/docs/mobile-money-1
 */
export const FLW_PAYOUT_NETWORK = process.env.FLW_PAYOUT_NETWORK || "MPS";

/**
 * The balance payouts are debited from. Same currency as the destination for a
 * domestic ZMW payout, so no conversion happens; override only if the merchant
 * account funds Zambian wallets out of another currency's balance.
 */
export const FLW_PAYOUT_SOURCE_CURRENCY =
  process.env.FLW_PAYOUT_SOURCE_CURRENCY || FLW_CURRENCY;

/** Zambian mobile prefixes, in national form (leading zero stripped). */
const NETWORK_PREFIXES: Record<FlutterwaveNetwork, string[]> = {
  MTN: ["96", "76"],
  AIRTEL: ["97", "77"],
  ZAMTEL: ["95", "75"],
};

export class FlutterwaveError extends Error {
  constructor(message: string, readonly httpStatus: number) {
    super(message);
    this.name = "FlutterwaveError";
  }
}

export function assertFlutterwaveConfigured() {
  if (!FLW_CLIENT_ID) throw new FlutterwaveError("FLW_CLIENT_ID is not configured.", 500);
  if (!FLW_CLIENT_SECRET) throw new FlutterwaveError("FLW_CLIENT_SECRET is not configured.", 500);
}

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Charge lifecycle. `pending` covers everything still in flight — for mobile
 * money that is the window between us creating the charge and the customer
 * approving the push prompt on their handset, which can be minutes.
 */
export type ChargeStatus =
  | "pending"
  | "processing"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "voided"
  | "cancelled"
  | "expired";

/**
 * What the customer has to do next. Mobile money produces either
 * `redirect_url` (hosted authorisation page) or `payment_instruction` (a push
 * prompt on the handset); the PIN/OTP/AVS variants only occur on card.
 */
export type NextAction =
  | { type: "redirect_url"; redirect_url: { url: string } }
  | { type: "payment_instruction"; payment_instruction: { note?: string; [key: string]: unknown } }
  | { type: string; [key: string]: unknown };

export interface FlutterwaveCharge {
  id: string;
  reference?: string;
  amount?: number;
  currency?: string;
  status: ChargeStatus;
  next_action?: NextAction | null;
  processor_response?: { type?: string; code?: string } | null;
  issuer_response?: { type?: string; code?: string } | null;
  payment_method_details?: { type?: string; mobile_money?: { network?: string } } | null;
}

interface FlutterwaveEnvelope<T> {
  status?: string;
  message?: string;
  data?: T;
  error?: { type?: string; code?: string; message?: string; validation_errors?: unknown };
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

// Access tokens live 10 minutes. Cache one per process and refresh a minute
// early so a request never travels with a token that expires in flight.
const TOKEN_REFRESH_MARGIN_MS = 60_000;

let cachedToken: { value: string; expiresAt: number } | null = null;
let inFlightToken: Promise<string> | null = null;

async function requestAccessToken(): Promise<string> {
  const response = await fetch(FLW_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: FLW_CLIENT_ID,
      client_secret: FLW_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });

  const raw = await response.text();

  if (!response.ok) {
    console.error(`Flutterwave token request failed (${response.status}):`, raw);
    throw new FlutterwaveError("Could not authenticate with the payment gateway.", 502);
  }

  let payload: { access_token?: string; expires_in?: number };
  try {
    payload = JSON.parse(raw);
  } catch {
    console.error("Flutterwave returned a non-JSON token response:", raw);
    throw new FlutterwaveError("The payment gateway returned an unreadable response.", 502);
  }

  if (!payload.access_token) {
    throw new FlutterwaveError("The payment gateway did not return an access token.", 502);
  }

  const lifetimeMs = (payload.expires_in ?? 600) * 1000;
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(lifetimeMs - TOKEN_REFRESH_MARGIN_MS, 0),
  };
  return cachedToken.value;
}

/** Returns a cached token, or mints one — concurrent callers share a single request. */
async function getAccessToken(): Promise<string> {
  assertFlutterwaveConfigured();

  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (inFlightToken) return inFlightToken;

  inFlightToken = requestAccessToken().finally(() => {
    inFlightToken = null;
  });
  return inFlightToken;
}

/* -------------------------------------------------------------------------- */
/* Request plumbing                                                            */
/* -------------------------------------------------------------------------- */

interface FlutterwaveRequestOptions {
  method: "GET" | "POST" | "PUT";
  path: string;
  body?: unknown;
  /**
   * Required on POST/PUT. Passing the payment reference makes a retried
   * initiate resolve to the original charge instead of debiting twice.
   */
  idempotencyKey?: string;
}

async function flutterwaveRequest<T>({
  method,
  path,
  body,
  idempotencyKey,
}: FlutterwaveRequestOptions): Promise<{ httpStatus: number; payload: FlutterwaveEnvelope<T> }> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "X-Trace-Id": randomUUID(),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;

  const response = await fetch(`${FLW_API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  const raw = await response.text();

  let payload: FlutterwaveEnvelope<T> = {};
  if (raw) {
    try {
      payload = JSON.parse(raw) as FlutterwaveEnvelope<T>;
    } catch {
      console.error(`Flutterwave ${method} ${path} returned non-JSON (${response.status}):`, raw);
      throw new FlutterwaveError("The payment gateway returned an unreadable response.", 502);
    }
  }

  return { httpStatus: response.status, payload };
}

/** Prefers the gateway's own message so the customer sees why a charge was refused. */
function errorMessage(payload: FlutterwaveEnvelope<unknown>, fallback: string) {
  return payload.error?.message || payload.message || fallback;
}

/* -------------------------------------------------------------------------- */
/* Charges                                                                     */
/* -------------------------------------------------------------------------- */

export interface CreateMobileMoneyChargeInput {
  reference: string;
  amount: number;
  currency: string;
  network: FlutterwaveNetwork;
  /** National or international form; normalised before it is sent. */
  phoneNumber: string;
  email: string;
  name: { first: string; last?: string };
  /** Where Flutterwave returns the customer after a hosted authorisation page. */
  redirectUrl?: string;
}

/**
 * POST /orchestration/direct-charges
 *
 * Creates the customer, the payment method and the charge in one call. The
 * returned `next_action` is what the customer still has to do — this call
 * succeeding means the charge was accepted, never that it was paid.
 */
export async function createMobileMoneyCharge(
  input: CreateMobileMoneyChargeInput
): Promise<FlutterwaveCharge> {
  const msisdn = toNationalNumber(input.phoneNumber);

  const { httpStatus, payload } = await flutterwaveRequest<FlutterwaveCharge>({
    method: "POST",
    path: "/orchestration/direct-charges",
    idempotencyKey: input.reference,
    body: {
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      ...(toValidRedirectUrl(input.redirectUrl)
        ? { redirect_url: toValidRedirectUrl(input.redirectUrl) }
        : {}),
      payment_method: {
        type: "mobile_money",
        mobile_money: {
          country_code: ZM_COUNTRY_CODE,
          network: input.network,
          phone_number: msisdn,
        },
      },
      customer: {
        email: input.email,
        name: input.name,
        phone: {
          country_code: ZM_COUNTRY_CODE,
          number: msisdn,
        },
      },
    },
  });

  if (httpStatus >= 400 || !payload.data?.id) {
    console.error(`Flutterwave direct-charge failed (${httpStatus}):`, JSON.stringify(payload));
    throw new FlutterwaveError(
      errorMessage(payload, "The payment could not be started. Please try again."),
      httpStatus === 422 || httpStatus === 400 ? 400 : 502
    );
  }

  return payload.data;
}

/**
 * GET /charges/:id
 *
 * Returns null when Flutterwave has no record of the charge, which is possible
 * in the moments right after creation.
 */
export async function retrieveCharge(chargeId: string): Promise<FlutterwaveCharge | null> {
  const { httpStatus, payload } = await flutterwaveRequest<FlutterwaveCharge>({
    method: "GET",
    path: `/charges/${encodeURIComponent(chargeId)}`,
  });

  if (httpStatus === 404) return null;

  if (httpStatus >= 400) {
    console.error(`Flutterwave charge lookup failed (${httpStatus}):`, JSON.stringify(payload));
    throw new FlutterwaveError("Could not reach Flutterwave to confirm this payment.", 502);
  }

  return payload.data ?? null;
}

export function isSettledStatus(status: ChargeStatus) {
  return status === "succeeded";
}

export function isFailedStatus(status: ChargeStatus) {
  return (
    status === "failed" || status === "voided" || status === "cancelled" || status === "expired"
  );
}

/** A customer-facing explanation for a refused charge, when the gateway gave one. */
export function chargeFailureReason(charge: FlutterwaveCharge) {
  return (
    charge.processor_response?.type ||
    charge.issuer_response?.type ||
    (charge.status === "expired" ? "The payment request expired before it was approved." : null) ||
    (charge.status === "voided" ? "The payment was voided before it settled." : null)
  );
}

/**
 * Guards against honouring a charge that settled for less than the plan price,
 * or in the wrong currency.
 */
export function chargeMatchesPayment(
  charge: { amount?: number; currency?: string },
  expectedAmount: number,
  expectedCurrency: string
) {
  const collected = Number(charge.amount);
  if (!Number.isFinite(collected) || !Number.isFinite(expectedAmount)) return false;
  // Tolerate float representation only, not genuine underpayment.
  return (
    collected + 0.001 >= expectedAmount &&
    (charge.currency || "").toUpperCase() === expectedCurrency.toUpperCase()
  );
}

/* -------------------------------------------------------------------------- */
/* Transfers (payouts)                                                         */
/* -------------------------------------------------------------------------- */

// Paying a creator is the mirror of collecting a subscription, with one extra
// wrinkle: the money leaves our Flutterwave balance the moment the transfer is
// accepted, so nothing here may run without an admin having approved the payout
// first (see lib/payouts.ts). As with charges we take no webhooks — a transfer
// is only believed to have landed once `GET /transfers/{id}` says SUCCESSFUL.
// https://developer.flutterwave.com/docs/mobile-money-1

/**
 * Transfer lifecycle. `NEW` is what creating a transfer always returns: it
 * means accepted for processing, never delivered. `INITIATED` and `PENDING` are
 * the in-flight states between that and a final SUCCESSFUL / FAILED /
 * CANCELLED.
 */
export type TransferStatus =
  | "NEW"
  | "INITIATED"
  | "PENDING"
  | "SUCCESSFUL"
  | "FAILED"
  | "CANCELLED";

export interface FlutterwaveTransfer {
  id: string;
  reference?: string;
  status: TransferStatus;
  type?: string;
  action?: string;
  narration?: string;
  source_currency?: string;
  destination_currency?: string;
  amount?: { value?: number; applies_to?: string };
  recipient?: {
    type?: string;
    id?: string;
    name?: { first?: string; last?: string };
    currency?: string;
    mobile_money?: { network?: string; msisdn?: string; country?: string };
  } | null;
  complete_message?: string;
  created_datetime?: string;
}

export interface CreateMobileMoneyTransferInput {
  reference: string;
  amount: number;
  /** The currency the recipient is paid in — the `amount` is denominated in it. */
  destinationCurrency: string;
  /** National or international form; normalised to a country-code MSISDN. */
  phoneNumber: string;
  name: { first: string; last?: string };
  /** Shown on the recipient's statement. */
  narration?: string;
}

/**
 * POST /direct-transfers
 *
 * Sends money to a mobile money wallet in one call, creating the recipient
 * inline. Returns with `status: "NEW"` — accepted, not delivered — so the
 * caller must go on to poll `retrieveTransfer`.
 *
 * `amount.applies_to` is `destination_currency`, which pins the figure to what
 * the creator receives: on a cross-currency payout it is our source balance
 * that flexes with the rate, never the amount they were promised.
 */
export async function createMobileMoneyTransfer(
  input: CreateMobileMoneyTransferInput
): Promise<FlutterwaveTransfer> {
  const { httpStatus, payload } = await flutterwaveRequest<FlutterwaveTransfer>({
    method: "POST",
    path: "/direct-transfers",
    idempotencyKey: input.reference,
    body: {
      action: "instant",
      type: "mobile_money",
      reference: input.reference,
      ...(input.narration ? { narration: input.narration.slice(0, 100) } : {}),
      payment_instruction: {
        source_currency: FLW_PAYOUT_SOURCE_CURRENCY,
        destination_currency: input.destinationCurrency,
        amount: {
          applies_to: "destination_currency",
          value: input.amount,
        },
        recipient: {
          name: input.name,
          mobile_money: {
            network: FLW_PAYOUT_NETWORK,
            // Unlike a charge, a transfer takes no separate country code — the
            // MSISDN itself has to carry it.
            msisdn: toInternationalNumber(input.phoneNumber),
          },
        },
      },
    },
  });

  if (httpStatus >= 400 || !payload.data?.id) {
    console.error(`Flutterwave transfer failed (${httpStatus}):`, JSON.stringify(payload));
    throw new FlutterwaveError(
      errorMessage(payload, "The payout could not be sent. Please try again."),
      httpStatus === 422 || httpStatus === 400 ? 400 : 502
    );
  }

  return payload.data;
}

/**
 * GET /transfers/:id
 *
 * Returns null when Flutterwave has no record of the transfer. Note it answers
 * a missing transfer with 400 `TRANSFER_NOT_FOUND` rather than a 404, so both
 * are treated as "not there".
 */
export async function retrieveTransfer(transferId: string): Promise<FlutterwaveTransfer | null> {
  const { httpStatus, payload } = await flutterwaveRequest<FlutterwaveTransfer>({
    method: "GET",
    path: `/transfers/${encodeURIComponent(transferId)}`,
  });

  if (httpStatus === 404 || payload.error?.type === "TRANSFER_NOT_FOUND") return null;

  if (httpStatus >= 400) {
    console.error(`Flutterwave transfer lookup failed (${httpStatus}):`, JSON.stringify(payload));
    throw new FlutterwaveError("Could not reach Flutterwave to confirm this payout.", 502);
  }

  return payload.data ?? null;
}

export function isSettledTransferStatus(status: TransferStatus) {
  return status === "SUCCESSFUL";
}

export function isFailedTransferStatus(status: TransferStatus) {
  return status === "FAILED" || status === "CANCELLED";
}

/** A creator-facing explanation for a transfer that did not land, when there is one. */
export function transferFailureReason(transfer: FlutterwaveTransfer) {
  return (
    transfer.complete_message ||
    (transfer.status === "CANCELLED" ? "The payout was cancelled before it was paid out." : null)
  );
}

/* -------------------------------------------------------------------------- */
/* References, phone numbers, networks                                         */
/* -------------------------------------------------------------------------- */

/** References must be unique per charge; keep them to safe URL characters. */
export function generatePaymentReference(userId: bigint | string) {
  const random = Math.random().toString(36).slice(2, 10);
  return `tambako-${userId}-${Date.now()}-${random}`;
}

/** Same shape as a payment reference, but never collides with one. */
export function generatePayoutReference(providerId: bigint | string) {
  const random = Math.random().toString(36).slice(2, 10);
  return `tambako-payout-${providerId}-${Date.now()}-${random}`;
}

export function isValidReference(reference: string) {
  return /^[A-Za-z0-9._-]{1,100}$/.test(reference);
}

/**
 * Strips a Zambian number down to its 9 national digits: `0966123456`,
 * `+260966123456` and `260966123456` all become `966123456`, which is the form
 * the API expects alongside a separate `country_code`.
 */
export function toNationalNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith(ZM_COUNTRY_CODE)) return digits.slice(ZM_COUNTRY_CODE.length);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/**
 * The same number in the form transfers want: the 9 national digits behind the
 * country code, as one string — `0966123456` becomes `260966123456`. The
 * transfers API has no separate country_code field, so an MSISDN that does not
 * start with one is delivered nowhere.
 */
export function toInternationalNumber(phone: string) {
  return `${ZM_COUNTRY_CODE}${toNationalNumber(phone)}`;
}

export function isValidZambianNumber(phone: string) {
  return /^[79]\d{8}$/.test(toNationalNumber(phone));
}

/** Best-effort network guess from the prefix; the customer can always override it. */
export function detectNetwork(phone: string): FlutterwaveNetwork | null {
  const prefix = toNationalNumber(phone).slice(0, 2);
  for (const network of FLW_NETWORKS) {
    if (NETWORK_PREFIXES[network].includes(prefix)) return network;
  }
  return null;
}

export function isValidNetwork(value: unknown): value is FlutterwaveNetwork {
  return typeof value === "string" && FLW_NETWORKS.includes(value as FlutterwaveNetwork);
}

/**
 * Flutterwave only accepts a `redirect_url` that is publicly reachable over
 * HTTPS — an `http://localhost:3000` callback is refused outright with
 * `REDIRECT_URL_INVALID`, which would fail the whole charge. Dropping the field
 * in dev costs nothing: without it mobile money simply falls back to the
 * on-handset prompt, which is the usual flow anyway.
 */
export function toValidRedirectUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Splits a full name into the `first`/`last` pair the API wants. Each part must
 * be 2–50 characters of letters, spaces, hyphens or apostrophes; anything
 * shorter is rejected with `REQUEST_NOT_VALID`. `last` is optional, so a
 * one-word name (or an initial for a surname) drops it rather than failing.
 */
export function splitCustomerName(fullName: string): { first: string; last?: string } | null {
  const clean = (part: string) =>
    part
      .replace(/[^\p{L} '-]/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50);

  const parts = clean(fullName).split(" ").filter(Boolean);
  if (parts.length === 0) return null;

  const first = parts[0];
  if (first.length < 2) return null;

  const last = clean(parts.slice(1).join(" "));
  return last.length >= 2 ? { first, last } : { first };
}

