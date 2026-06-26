-- CreateTable
CREATE TABLE "ContactList" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCheckConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "systemTeams" BOOLEAN NOT NULL DEFAULT true,
    "systemCategories" BOOLEAN NOT NULL DEFAULT true,
    "storages" BOOLEAN NOT NULL DEFAULT true,
    "users" BOOLEAN NOT NULL DEFAULT true,
    "customNames" JSONB NOT NULL DEFAULT '[]',
    "excluded" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCheckConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocKitContext" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "envKey" TEXT NOT NULL,
    "ownerId" TEXT,
    "templateId" TEXT,
    "datasets" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocKitContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactList_orgId_name_key" ON "ContactList"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ApiCheckConfig_orgId_key" ON "ApiCheckConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "DocKitContext_orgId_envKey_key" ON "DocKitContext"("orgId", "envKey");

-- AddForeignKey
ALTER TABLE "ContactList" ADD CONSTRAINT "ContactList_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiCheckConfig" ADD CONSTRAINT "ApiCheckConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocKitContext" ADD CONSTRAINT "DocKitContext_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
