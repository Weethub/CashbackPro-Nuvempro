-- AlterTable
ALTER TABLE "support_tickets" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "cashback_configs" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "pointsPerCurrency" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "redeemThreshold" INTEGER NOT NULL DEFAULT 100,
    "couponType" TEXT NOT NULL DEFAULT 'percent_off',
    "couponValue" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "nuvemshopFieldId" TEXT,
    "welcomeMessage" TEXT,
    "redeemMessage" TEXT,
    "widgetIconPosition" TEXT NOT NULL DEFAULT 'bottom-right',
    "widgetIconSize" TEXT NOT NULL DEFAULT 'md',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashback_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashback_tiers" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "pointsRequired" INTEGER NOT NULL,
    "couponType" TEXT NOT NULL,
    "couponValue" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashback_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_points" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "nuvemshopCustomerId" TEXT NOT NULL,
    "email" TEXT,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "cycleStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_transactions" (
    "id" SERIAL NOT NULL,
    "customerPointsId" INTEGER NOT NULL,
    "storeId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "nuvemshopOrderId" TEXT,
    "couponCode" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_otps" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "nuvemshopCustomerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" SERIAL NOT NULL,
    "customerPointsId" INTEGER NOT NULL,
    "storeId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cashback_configs_storeId_key" ON "cashback_configs"("storeId");

-- CreateIndex
CREATE INDEX "cashback_tiers_storeId_sortOrder_idx" ON "cashback_tiers"("storeId", "sortOrder");

-- CreateIndex
CREATE INDEX "customer_points_storeId_idx" ON "customer_points"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_points_storeId_nuvemshopCustomerId_key" ON "customer_points"("storeId", "nuvemshopCustomerId");

-- CreateIndex
CREATE INDEX "points_transactions_customerPointsId_idx" ON "points_transactions"("customerPointsId");

-- CreateIndex
CREATE INDEX "points_transactions_storeId_createdAt_idx" ON "points_transactions"("storeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "customer_otps_storeId_nuvemshopCustomerId_idx" ON "customer_otps"("storeId", "nuvemshopCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_token_key" ON "customer_sessions"("token");

-- CreateIndex
CREATE INDEX "customer_sessions_customerPointsId_idx" ON "customer_sessions"("customerPointsId");

-- AddForeignKey
ALTER TABLE "cashback_configs" ADD CONSTRAINT "cashback_configs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_tiers" ADD CONSTRAINT "cashback_tiers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_points" ADD CONSTRAINT "customer_points_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_customerPointsId_fkey" FOREIGN KEY ("customerPointsId") REFERENCES "customer_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_otps" ADD CONSTRAINT "customer_otps_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customerPointsId_fkey" FOREIGN KEY ("customerPointsId") REFERENCES "customer_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

