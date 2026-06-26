-- DropForeignKey
ALTER TABLE "Environment" DROP CONSTRAINT "Environment_platformId_fkey";

-- AlterTable
ALTER TABLE "Environment" ADD COLUMN     "appId" TEXT,
ADD COLUMN     "baseUrl" TEXT,
ADD COLUMN     "tokenEnc" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'qa',
ALTER COLUMN "platformId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE SET NULL ON UPDATE CASCADE;
