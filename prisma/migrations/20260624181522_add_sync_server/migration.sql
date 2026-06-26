-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "srcEnvId" TEXT,
    "dstEnvSlug" TEXT,
    "direction" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "mode" TEXT NOT NULL DEFAULT 'merge',
    "triggeredById" TEXT,
    "triggerType" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalItems" INTEGER,
    "doneItems" INTEGER,
    "currentScope" TEXT,
    "errorMessage" TEXT,
    "log" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonSnapshot" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "envId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "iconikBaseUrl" TEXT,
    "objectCount" INTEGER NOT NULL DEFAULT 0,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IkonSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonCollection" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parentId" TEXT,
    "path" TEXT,
    "status" TEXT,
    "storageId" TEXT,
    "externalId" TEXT,
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "objectType" TEXT NOT NULL DEFAULT 'collection',
    "dateDeleted" TIMESTAMP(3),
    "rawData" JSONB,

    CONSTRAINT "IkonCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonTeam" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isAclStub" BOOLEAN NOT NULL DEFAULT false,
    "userIds" JSONB NOT NULL DEFAULT '[]',
    "roleGroupIds" JSONB NOT NULL DEFAULT '[]',
    "collectionIds" JSONB NOT NULL DEFAULT '[]',
    "viewIds" JSONB NOT NULL DEFAULT '[]',
    "storageIds" JSONB NOT NULL DEFAULT '[]',
    "settings" JSONB,
    "aclFlags" JSONB,
    "rawData" JSONB,

    CONSTRAINT "IkonTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonUser" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "displayName" TEXT,
    "status" TEXT,
    "userType" TEXT,
    "teamIds" JSONB NOT NULL DEFAULT '[]',
    "roleGroupIds" JSONB NOT NULL DEFAULT '[]',
    "rawData" JSONB,

    CONSTRAINT "IkonUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonMetadataView" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "viewFields" JSONB NOT NULL DEFAULT '[]',
    "rawData" JSONB,

    CONSTRAINT "IkonMetadataView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonField" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "fieldType" TEXT,
    "uiType" TEXT,
    "isMultiple" BOOLEAN NOT NULL DEFAULT false,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB NOT NULL DEFAULT '[]',
    "rawData" JSONB,

    CONSTRAINT "IkonField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonRoleGroup" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "roles" JSONB NOT NULL DEFAULT '[]',
    "roleCategories" JSONB NOT NULL DEFAULT '{}',
    "rawData" JSONB,

    CONSTRAINT "IkonRoleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonSavedSearch" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB,
    "shareWithTeams" JSONB NOT NULL DEFAULT '[]',
    "rawData" JSONB,

    CONSTRAINT "IkonSavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonStorage" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storageType" TEXT,
    "status" TEXT,
    "scannerStatus" TEXT,
    "purpose" TEXT,
    "teamIds" JSONB NOT NULL DEFAULT '[]',
    "rawData" JSONB,

    CONSTRAINT "IkonStorage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonCategory" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT,
    "name" TEXT NOT NULL,
    "apiName" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "objectTypes" JSONB NOT NULL DEFAULT '[]',
    "viewIds" JSONB NOT NULL DEFAULT '[]',
    "rawData" JSONB,

    CONSTRAINT "IkonCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonWebhook" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "eventType" TEXT,
    "realm" TEXT,
    "operation" TEXT,
    "status" TEXT,
    "headers" JSONB NOT NULL DEFAULT '[]',
    "rawData" JSONB,

    CONSTRAINT "IkonWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonAutomation" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "actions" JSONB NOT NULL DEFAULT '[]',
    "conditions" JSONB,
    "rawData" JSONB,

    CONSTRAINT "IkonAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonCustomAction" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objectTypes" JSONB NOT NULL DEFAULT '[]',
    "url" TEXT,
    "method" TEXT,
    "teamIds" JSONB NOT NULL DEFAULT '[]',
    "rawData" JSONB,

    CONSTRAINT "IkonCustomAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonRelationType" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDirectional" BOOLEAN NOT NULL DEFAULT false,
    "sourceLabel" TEXT,
    "destinationLabel" TEXT,
    "description" TEXT,
    "rawData" JSONB,

    CONSTRAINT "IkonRelationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonSystemSettings" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "shareSettings" JSONB,
    "searchSettings" JSONB,
    "uploadSettings" JSONB,
    "downloadSettings" JSONB,
    "aclSettings" JSONB,
    "rawData" JSONB,

    CONSTRAINT "IkonSystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonExportLocation" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationType" TEXT,
    "status" TEXT,
    "rawData" JSONB,

    CONSTRAINT "IkonExportLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonRole" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "category" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "rawData" JSONB,

    CONSTRAINT "IkonRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IkonApp" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "iconikId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rawData" JSONB,

    CONSTRAINT "IkonApp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncJob_orgId_direction_status_idx" ON "SyncJob"("orgId", "direction", "status");

-- CreateIndex
CREATE INDEX "SyncJob_srcEnvId_idx" ON "SyncJob"("srcEnvId");

-- CreateIndex
CREATE INDEX "IkonSnapshot_envId_scope_isCurrent_idx" ON "IkonSnapshot"("envId", "scope", "isCurrent");

-- CreateIndex
CREATE INDEX "IkonSnapshot_envId_capturedAt_idx" ON "IkonSnapshot"("envId", "capturedAt");

-- CreateIndex
CREATE INDEX "IkonCollection_snapshotId_iconikId_idx" ON "IkonCollection"("snapshotId", "iconikId");

-- CreateIndex
CREATE INDEX "IkonCollection_snapshotId_parentId_idx" ON "IkonCollection"("snapshotId", "parentId");

-- CreateIndex
CREATE INDEX "IkonCollection_snapshotId_path_idx" ON "IkonCollection"("snapshotId", "path");

-- CreateIndex
CREATE INDEX "IkonTeam_snapshotId_iconikId_idx" ON "IkonTeam"("snapshotId", "iconikId");

-- CreateIndex
CREATE INDEX "IkonTeam_snapshotId_name_idx" ON "IkonTeam"("snapshotId", "name");

-- CreateIndex
CREATE INDEX "IkonUser_snapshotId_iconikId_idx" ON "IkonUser"("snapshotId", "iconikId");

-- CreateIndex
CREATE INDEX "IkonUser_snapshotId_email_idx" ON "IkonUser"("snapshotId", "email");

-- CreateIndex
CREATE INDEX "IkonMetadataView_snapshotId_iconikId_idx" ON "IkonMetadataView"("snapshotId", "iconikId");

-- CreateIndex
CREATE INDEX "IkonMetadataView_snapshotId_name_idx" ON "IkonMetadataView"("snapshotId", "name");

-- CreateIndex
CREATE INDEX "IkonField_snapshotId_iconikId_idx" ON "IkonField"("snapshotId", "iconikId");

-- CreateIndex
CREATE INDEX "IkonField_snapshotId_name_idx" ON "IkonField"("snapshotId", "name");

-- CreateIndex
CREATE INDEX "IkonRoleGroup_snapshotId_iconikId_idx" ON "IkonRoleGroup"("snapshotId", "iconikId");

-- CreateIndex
CREATE INDEX "IkonRoleGroup_snapshotId_name_idx" ON "IkonRoleGroup"("snapshotId", "name");

-- CreateIndex
CREATE INDEX "IkonSavedSearch_snapshotId_iconikId_idx" ON "IkonSavedSearch"("snapshotId", "iconikId");

-- CreateIndex
CREATE INDEX "IkonSavedSearch_snapshotId_name_idx" ON "IkonSavedSearch"("snapshotId", "name");

-- CreateIndex
CREATE INDEX "IkonStorage_snapshotId_iconikId_idx" ON "IkonStorage"("snapshotId", "iconikId");

-- CreateIndex
CREATE INDEX "IkonStorage_snapshotId_name_idx" ON "IkonStorage"("snapshotId", "name");

-- CreateIndex
CREATE INDEX "IkonCategory_snapshotId_apiName_idx" ON "IkonCategory"("snapshotId", "apiName");

-- CreateIndex
CREATE INDEX "IkonWebhook_snapshotId_iconikId_idx" ON "IkonWebhook"("snapshotId", "iconikId");

-- CreateIndex
CREATE INDEX "IkonWebhook_snapshotId_name_idx" ON "IkonWebhook"("snapshotId", "name");

-- CreateIndex
CREATE INDEX "IkonAutomation_snapshotId_iconikId_idx" ON "IkonAutomation"("snapshotId", "iconikId");

-- CreateIndex
CREATE INDEX "IkonAutomation_snapshotId_name_idx" ON "IkonAutomation"("snapshotId", "name");

-- CreateIndex
CREATE INDEX "IkonCustomAction_snapshotId_iconikId_idx" ON "IkonCustomAction"("snapshotId", "iconikId");

-- CreateIndex
CREATE INDEX "IkonCustomAction_snapshotId_title_idx" ON "IkonCustomAction"("snapshotId", "title");

-- CreateIndex
CREATE INDEX "IkonRelationType_snapshotId_iconikId_idx" ON "IkonRelationType"("snapshotId", "iconikId");

-- CreateIndex
CREATE INDEX "IkonRelationType_snapshotId_name_idx" ON "IkonRelationType"("snapshotId", "name");

-- CreateIndex
CREATE INDEX "IkonSystemSettings_snapshotId_idx" ON "IkonSystemSettings"("snapshotId");

-- CreateIndex
CREATE INDEX "IkonExportLocation_snapshotId_iconikId_idx" ON "IkonExportLocation"("snapshotId", "iconikId");

-- CreateIndex
CREATE INDEX "IkonExportLocation_snapshotId_name_idx" ON "IkonExportLocation"("snapshotId", "name");

-- CreateIndex
CREATE INDEX "IkonRole_snapshotId_name_idx" ON "IkonRole"("snapshotId", "name");

-- CreateIndex
CREATE INDEX "IkonApp_snapshotId_iconikId_idx" ON "IkonApp"("snapshotId", "iconikId");

-- CreateIndex
CREATE INDEX "IkonApp_snapshotId_name_idx" ON "IkonApp"("snapshotId", "name");

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_srcEnvId_fkey" FOREIGN KEY ("srcEnvId") REFERENCES "Environment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonSnapshot" ADD CONSTRAINT "IkonSnapshot_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SyncJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonSnapshot" ADD CONSTRAINT "IkonSnapshot_envId_fkey" FOREIGN KEY ("envId") REFERENCES "Environment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonCollection" ADD CONSTRAINT "IkonCollection_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonTeam" ADD CONSTRAINT "IkonTeam_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonUser" ADD CONSTRAINT "IkonUser_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonMetadataView" ADD CONSTRAINT "IkonMetadataView_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonField" ADD CONSTRAINT "IkonField_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonRoleGroup" ADD CONSTRAINT "IkonRoleGroup_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonSavedSearch" ADD CONSTRAINT "IkonSavedSearch_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonStorage" ADD CONSTRAINT "IkonStorage_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonCategory" ADD CONSTRAINT "IkonCategory_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonWebhook" ADD CONSTRAINT "IkonWebhook_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonAutomation" ADD CONSTRAINT "IkonAutomation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonCustomAction" ADD CONSTRAINT "IkonCustomAction_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonRelationType" ADD CONSTRAINT "IkonRelationType_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonSystemSettings" ADD CONSTRAINT "IkonSystemSettings_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonExportLocation" ADD CONSTRAINT "IkonExportLocation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonRole" ADD CONSTRAINT "IkonRole_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IkonApp" ADD CONSTRAINT "IkonApp_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "IkonSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
