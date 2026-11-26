-- KAAFILA platform v2: per-vehicle billing, garage, devices, safety, kitty, social, meetups, admin.
-- Generated with prisma migrate diff and hand-edited so it also applies cleanly over v1 data.

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('petrol', 'diesel', 'cng', 'lpg', 'ev', 'hybrid');

-- CreateEnum
CREATE TYPE "TaxMode" AS ENUM ('inclusive', 'exclusive');

-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('phone', 'tablet', 'car_display', 'obd_adapter', 'dashcam', 'wearable');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('active', 'revoked');

-- CreateEnum
CREATE TYPE "SosKind" AS ENUM ('manual', 'crash_detected', 'medical', 'breakdown', 'security');

-- CreateEnum
CREATE TYPE "SosStatus" AS ENUM ('open', 'acknowledged', 'resolved', 'false_alarm');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('text', 'quick_signal', 'system');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('fuel', 'toll', 'food', 'stay', 'parking', 'repair', 'activity', 'other');

-- CreateEnum
CREATE TYPE "PostVisibility" AS ENUM ('public', 'followers', 'club');

-- CreateEnum
CREATE TYPE "MeetupStatus" AS ENUM ('draft', 'pending_review', 'published', 'rejected', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('going', 'waitlist', 'cancelled', 'checked_in');

-- CreateEnum
CREATE TYPE "RoadReportType" AS ENUM ('pothole', 'accident', 'police_check', 'flooding', 'roadwork', 'debris', 'animal', 'fog', 'closure', 'speed_camera');

-- AlterEnum
BEGIN;
CREATE TYPE "PlanCode_new" AS ENUM ('explorer', 'drive', 'fleet');
-- defaultPlan is removed: entitlements are per vehicle now. Drop it before swapping the enum type.
ALTER TABLE "User" DROP COLUMN "defaultPlan";
ALTER TABLE "Subscription" ALTER COLUMN "plan" TYPE "PlanCode_new" USING ((CASE "plan"::text WHEN 'pro' THEN 'drive' WHEN 'free' THEN 'explorer' ELSE "plan"::text END)::"PlanCode_new");
ALTER TYPE "PlanCode" RENAME TO "PlanCode_old";
ALTER TYPE "PlanCode_new" RENAME TO "PlanCode";
DROP TYPE "PlanCode_old";
COMMIT;

-- AlterEnum
ALTER TYPE "ConvoyRole" ADD VALUE 'navigator';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertType" ADD VALUE 'fatigue';
ALTER TYPE "AlertType" ADD VALUE 'low_range';
ALTER TYPE "AlertType" ADD VALUE 'dead_zone';
ALTER TYPE "AlertType" ADD VALUE 'regroup';

-- DropIndex
DROP INDEX "Subscription_provider_providerSubId_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "bloodGroup" VARCHAR(4),
ADD COLUMN     "countryCode" VARCHAR(2),
ADD COLUMN     "handle" TEXT,
ADD COLUMN     "homeCity" TEXT,
ADD COLUMN     "isSuspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "medicalNotes" TEXT,
ADD COLUMN     "suspendedReason" TEXT,
ADD COLUMN     "upiVpa" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "fuelType" "FuelType",
ADD COLUMN     "isShowcase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "odometerKm" INTEGER,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "rangeKmFull" INTEGER,
ADD COLUMN     "year" INTEGER;

-- AlterTable
ALTER TABLE "Convoy" ADD COLUMN     "destinationName" TEXT,
ADD COLUMN     "originName" TEXT,
ADD COLUMN     "regroupLat" DOUBLE PRECISION,
ADD COLUMN     "regroupLng" DOUBLE PRECISION,
ADD COLUMN     "regroupName" TEXT,
ADD COLUMN     "regroupSetAt" TIMESTAMP(3),
ADD COLUMN     "regroupSetBy" TEXT,
ADD COLUMN     "routeDistanceM" INTEGER,
ADD COLUMN     "routeDurationS" INTEGER,
ADD COLUMN     "routeProvider" TEXT,
ALTER COLUMN "maxVehicles" SET DEFAULT 50;

-- AlterTable
ALTER TABLE "RouteCheckpoint" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'checkpoint';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "taxMode" "TaxMode" NOT NULL DEFAULT 'inclusive',
ADD COLUMN     "unitAmountMinor" INTEGER NOT NULL DEFAULT 50000;
ALTER TABLE "Subscription" ALTER COLUMN "unitAmountMinor" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "city" TEXT,
ADD COLUMN     "countryCode" VARCHAR(2),
ADD COLUMN     "coverUrl" TEXT;

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "odometerKm" INTEGER,
    "costMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "vendor" TEXT,
    "notes" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceReminder" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "dueOdometerKm" INTEGER,
    "intervalDays" INTEGER,
    "intervalKm" INTEGER,
    "lastDoneAt" TIMESTAMP(3),
    "lastDoneOdometerKm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleDocument" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "number" TEXT,
    "issuer" TEXT,
    "expiresAt" TIMESTAMP(3),
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleTelemetry" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'obd',
    "readings" JSONB NOT NULL,
    "dtcs" TEXT[],
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleTelemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "kind" "DeviceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT,
    "capabilities" JSONB,
    "status" "DeviceStatus" NOT NULL DEFAULT 'active',
    "pairedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePairing" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "kind" "DeviceKind" NOT NULL DEFAULT 'tablet',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevicePairing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageCell" (
    "geohash" VARCHAR(12) NOT NULL,
    "samples" INTEGER NOT NULL DEFAULT 0,
    "gapCount" INTEGER NOT NULL DEFAULT 0,
    "lastGapAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverageCell_pkey" PRIMARY KEY ("geohash")
);

-- CreateTable
CREATE TABLE "ConvoyMessage" (
    "id" TEXT NOT NULL,
    "convoyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "kind" "MessageKind" NOT NULL DEFAULT 'text',
    "body" TEXT NOT NULL,
    "signal" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConvoyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "convoyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SosIncident" (
    "id" TEXT NOT NULL,
    "convoyId" TEXT,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "kind" "SosKind" NOT NULL,
    "status" "SosStatus" NOT NULL DEFAULT 'open',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "peakG" DOUBLE PRECISION,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "timeline" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SosIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "convoyId" TEXT NOT NULL,
    "paidById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'other',
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "splitMode" TEXT NOT NULL DEFAULT 'equal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseShare" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "ExpenseShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionSeat" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "clubId" TEXT,
    "convoyId" TEXT,
    "body" TEXT NOT NULL,
    "mediaUrls" TEXT[],
    "visibility" "PostVisibility" NOT NULL DEFAULT 'public',
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "convoyId" TEXT,
    "type" "RoadReportType" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "geohash5" VARCHAR(5) NOT NULL,
    "note" TEXT,
    "confirmations" INTEGER NOT NULL DEFAULT 1,
    "dismissals" INTEGER NOT NULL DEFAULT 0,
    "isRemoved" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadReportVote" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stillThere" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadReportVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meetup" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "clubId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "venueName" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "countryCode" VARCHAR(2),
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 50,
    "priceMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "coverUrl" TEXT,
    "status" "MeetupStatus" NOT NULL DEFAULT 'pending_review',
    "reviewNote" TEXT,
    "checkInCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetupRsvp" (
    "id" TEXT NOT NULL,
    "meetupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "status" "RsvpStatus" NOT NULL DEFAULT 'going',
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetupRsvp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "countryCode" VARCHAR(2),
    "severity" "AlertSeverity" NOT NULL DEFAULT 'info',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPct" INTEGER NOT NULL DEFAULT 100,
    "description" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "convoyId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceRecord_vehicleId_performedAt_idx" ON "MaintenanceRecord"("vehicleId", "performedAt");

-- CreateIndex
CREATE INDEX "ServiceReminder_vehicleId_idx" ON "ServiceReminder"("vehicleId");

-- CreateIndex
CREATE INDEX "ServiceReminder_dueAt_idx" ON "ServiceReminder"("dueAt");

-- CreateIndex
CREATE INDEX "VehicleDocument_vehicleId_idx" ON "VehicleDocument"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleDocument_expiresAt_idx" ON "VehicleDocument"("expiresAt");

-- CreateIndex
CREATE INDEX "VehicleTelemetry_vehicleId_capturedAt_idx" ON "VehicleTelemetry"("vehicleId", "capturedAt");

-- CreateIndex
CREATE INDEX "Device_userId_status_idx" ON "Device"("userId", "status");

-- CreateIndex
CREATE INDEX "Device_vehicleId_idx" ON "Device"("vehicleId");

-- CreateIndex
CREATE INDEX "DevicePairing_code_consumedAt_idx" ON "DevicePairing"("code", "consumedAt");

-- CreateIndex
CREATE INDEX "DevicePairing_ownerId_idx" ON "DevicePairing"("ownerId");

-- CreateIndex
CREATE INDEX "ConvoyMessage_convoyId_createdAt_idx" ON "ConvoyMessage"("convoyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");

-- CreateIndex
CREATE INDEX "ShareLink_convoyId_idx" ON "ShareLink"("convoyId");

-- CreateIndex
CREATE INDEX "SosIncident_status_createdAt_idx" ON "SosIncident"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SosIncident_convoyId_createdAt_idx" ON "SosIncident"("convoyId", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_convoyId_createdAt_idx" ON "Expense"("convoyId", "createdAt");

-- CreateIndex
CREATE INDEX "ExpenseShare_userId_idx" ON "ExpenseShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseShare_expenseId_userId_key" ON "ExpenseShare"("expenseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionSeat_vehicleId_key" ON "SubscriptionSeat"("vehicleId");

-- CreateIndex
CREATE INDEX "SubscriptionSeat_subscriptionId_idx" ON "SubscriptionSeat"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

-- CreateIndex
CREATE INDEX "Post_authorId_createdAt_idx" ON "Post"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_clubId_createdAt_idx" ON "Post"("clubId", "createdAt");

-- CreateIndex
CREATE INDEX "PostComment_postId_createdAt_idx" ON "PostComment"("postId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostLike_postId_userId_key" ON "PostLike"("postId", "userId");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "RoadReport_geohash5_expiresAt_idx" ON "RoadReport"("geohash5", "expiresAt");

-- CreateIndex
CREATE INDEX "RoadReport_createdAt_idx" ON "RoadReport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoadReportVote_reportId_userId_key" ON "RoadReportVote"("reportId", "userId");

-- CreateIndex
CREATE INDEX "Meetup_status_startsAt_idx" ON "Meetup"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Meetup_city_startsAt_idx" ON "Meetup"("city", "startsAt");

-- CreateIndex
CREATE INDEX "MeetupRsvp_meetupId_status_idx" ON "MeetupRsvp"("meetupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MeetupRsvp_meetupId_userId_key" ON "MeetupRsvp"("meetupId", "userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_subjectType_subjectId_idx" ON "AuditLog"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "Announcement_startsAt_endsAt_idx" ON "Announcement"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "AssistantMessage_userId_createdAt_idx" ON "AssistantMessage"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE INDEX "User_isSuspended_idx" ON "User"("isSuspended");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubId_key" ON "Subscription"("providerSubId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceReminder" ADD CONSTRAINT "ServiceReminder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocument" ADD CONSTRAINT "VehicleDocument_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleTelemetry" ADD CONSTRAINT "VehicleTelemetry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoyMessage" ADD CONSTRAINT "ConvoyMessage_convoyId_fkey" FOREIGN KEY ("convoyId") REFERENCES "Convoy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoyMessage" ADD CONSTRAINT "ConvoyMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_convoyId_fkey" FOREIGN KEY ("convoyId") REFERENCES "Convoy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SosIncident" ADD CONSTRAINT "SosIncident_convoyId_fkey" FOREIGN KEY ("convoyId") REFERENCES "Convoy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SosIncident" ADD CONSTRAINT "SosIncident_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_convoyId_fkey" FOREIGN KEY ("convoyId") REFERENCES "Convoy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseShare" ADD CONSTRAINT "ExpenseShare_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseShare" ADD CONSTRAINT "ExpenseShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionSeat" ADD CONSTRAINT "SubscriptionSeat_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionSeat" ADD CONSTRAINT "SubscriptionSeat_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadReport" ADD CONSTRAINT "RoadReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadReportVote" ADD CONSTRAINT "RoadReportVote_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "RoadReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadReportVote" ADD CONSTRAINT "RoadReportVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meetup" ADD CONSTRAINT "Meetup_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meetup" ADD CONSTRAINT "Meetup_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupRsvp" ADD CONSTRAINT "MeetupRsvp_meetupId_fkey" FOREIGN KEY ("meetupId") REFERENCES "Meetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupRsvp" ADD CONSTRAINT "MeetupRsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

