-- CreateTable
CREATE TABLE "OrganisationPlatform" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganisationPlatform_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationPlatform_orgId_platformId_key" ON "OrganisationPlatform"("orgId", "platformId");

-- AddForeignKey
ALTER TABLE "OrganisationPlatform" ADD CONSTRAINT "OrganisationPlatform_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationPlatform" ADD CONSTRAINT "OrganisationPlatform_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
