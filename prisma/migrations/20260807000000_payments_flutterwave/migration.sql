-- Switch the payments table from Lenco collections to Flutterwave charges.

-- RenameColumn
ALTER TABLE "payments" RENAME COLUMN "lenco_reference" TO "provider_reference";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "charge_id" VARCHAR(60);
ALTER TABLE "payments" ADD COLUMN "network" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX "payments_charge_id_key" ON "payments"("charge_id");
