-- Plans carry their own period (cycle + how many of them) so the admin can sell
-- a three-day pass as readily as a month, and payments record whether they were
-- an upgrade off a running plan.

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "description" VARCHAR(255);
ALTER TABLE "subscriptions" ADD COLUMN "billing_cycle" VARCHAR(10) NOT NULL DEFAULT 'daily';
ALTER TABLE "subscriptions" ADD COLUMN "duration_count" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "subscriptions" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- Existing plans were identified purely by their label, which is also the cycle
-- they billed on. `dialy` is a misspelling present in the seeded data.
UPDATE "subscriptions"
SET "billing_cycle" = CASE
  WHEN lower(trim("type")) IN ('weekly') THEN 'weekly'
  WHEN lower(trim("type")) IN ('monthly') THEN 'monthly'
  ELSE 'daily'
END;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "is_upgrade" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payments" ADD COLUMN "credit_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
