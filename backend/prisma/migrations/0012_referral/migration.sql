-- Indique e ganhe: código de indicação por cliente + config no programa.
ALTER TABLE "customer_points" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "customer_points" ADD COLUMN "referredByCode" TEXT;
ALTER TABLE "customer_points" ADD COLUMN "referralRewardedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "customer_points_referralCode_key" ON "customer_points"("referralCode");
CREATE INDEX "customer_points_storeId_referredByCode_idx" ON "customer_points"("storeId", "referredByCode");

ALTER TABLE "cashback_configs" ADD COLUMN "referralEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cashback_configs" ADD COLUMN "referralPointsReferrer" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cashback_configs" ADD COLUMN "referralPointsReferred" INTEGER NOT NULL DEFAULT 0;
