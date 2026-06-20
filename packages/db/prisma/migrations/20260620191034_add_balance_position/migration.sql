-- CreateEnum
CREATE TYPE "PositionSide" AS ENUM ('Long', 'Short');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('Open', 'Closed', 'Liquidated');

-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "maintenanceMargin" TEXT NOT NULL DEFAULT '0.005',
ADD COLUMN     "maxLeverage" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "tickSize" TEXT NOT NULL DEFAULT '0.1';

-- CreateTable
CREATE TABLE "Balance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "available" TEXT NOT NULL DEFAULT '0',
    "locked" TEXT NOT NULL DEFAULT '0',

    CONSTRAINT "Balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "side" "PositionSide" NOT NULL,
    "qty" TEXT NOT NULL,
    "avgEntryPrice" TEXT NOT NULL,
    "margin" TEXT NOT NULL,
    "leverage" INTEGER NOT NULL,
    "liquidationPrice" TEXT NOT NULL,
    "status" "PositionStatus" NOT NULL DEFAULT 'Open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Balance_userId_key" ON "Balance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_userId_market_id_key" ON "Position"("userId", "market_id");

-- AddForeignKey
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
