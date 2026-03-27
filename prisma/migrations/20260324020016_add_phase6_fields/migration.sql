-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "booking_type" TEXT,
ADD COLUMN     "event_guests" INTEGER,
ADD COLUMN     "event_type" TEXT,
ADD COLUMN     "food_cost" DECIMAL(14,2),
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "room_amount" DECIMAL(14,2),
ADD COLUMN     "services" TEXT;

-- AlterTable
ALTER TABLE "guests" ADD COLUMN     "city" TEXT;

-- AlterTable
ALTER TABLE "investors" ADD COLUMN     "contact" TEXT,
ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "assets" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "capital" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "comm" DECIMAL(6,3) NOT NULL DEFAULT 25,
ADD COLUMN     "rooms" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "state" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "type" TEXT NOT NULL DEFAULT '';
