-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('Filled', 'PartiallyFilled', 'Cancelled', 'Open');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('Bid', 'Ask');

-- CreateEnum
CREATE TYPE "orderType" AS ENUM ('Market', 'Limit');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "orderType" "orderType" NOT NULL,
    "side" "Side" NOT NULL,
    "price" TEXT,
    "slippage" INTEGER NOT NULL,
    "qty" TEXT NOT NULL,
    "initialMargin" TEXT NOT NULL,
    "filledQty" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fill" (
    "id" TEXT NOT NULL,
    "maker_id" TEXT NOT NULL,
    "taker_id" TEXT NOT NULL,
    "qty" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "maker_order_id" TEXT NOT NULL,
    "taker_order_id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fill_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_taker_order_id_fkey" FOREIGN KEY ("taker_order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_maker_order_id_fkey" FOREIGN KEY ("maker_order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_maker_id_fkey" FOREIGN KEY ("maker_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_taker_id_fkey" FOREIGN KEY ("taker_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
