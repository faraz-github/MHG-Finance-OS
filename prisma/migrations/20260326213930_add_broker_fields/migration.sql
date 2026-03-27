-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "broker_name" TEXT,
ADD COLUMN     "broker_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN     "broker_public" BOOLEAN NOT NULL DEFAULT false;
