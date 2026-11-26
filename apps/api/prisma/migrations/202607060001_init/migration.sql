-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin', 'support');

-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('free', 'pro');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('car', 'suv', 'supercar', 'motorcycle', 'bus', 'truck', 'ev', 'support');

-- CreateEnum
CREATE TYPE "ConvoyStatus" AS ENUM ('scheduled', 'boarding', 'active', 'paused', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ConvoyVisibility" AS ENUM ('private', 'club', 'public', 'fleet', 'event');

-- CreateEnum
CREATE TYPE "ConvoyRole" AS ENUM ('owner', 'leader', 'sweeper', 'driver', 'family', 'viewer');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('invited', 'active', 'muted', 'removed');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('vehicle_separation', 'lost_vehicle', 'route_deviation', 'speed_camera', 'checkpoint', 'road_hazard', 'toll', 'pit_stop', 'sos');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "VoiceChannelType" AS ENUM ('main', 'leaders', 'emergency', 'team');

-- CreateEnum
CREATE TYPE "JourneyStatus" AS ENUM ('recording', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('photo', 'video', 'voice_note', 'report', 'ai_movie');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('checkout_pending', 'active', 'past_due', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('razorpay', 'stripe');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'reviewing', 'resolved', 'rejected');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "defaultPlan" "PlanCode" NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "name" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "plateNumber" TEXT,
    "color" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "obdDeviceId" TEXT,
    "telemetry" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Convoy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "leaderUserId" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "visibility" "ConvoyVisibility" NOT NULL DEFAULT 'private',
    "status" "ConvoyStatus" NOT NULL DEFAULT 'scheduled',
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destinationLat" DOUBLE PRECISION NOT NULL,
    "destinationLng" DOUBLE PRECISION NOT NULL,
    "routePolyline" TEXT,
    "plannedDepartureAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "maxVehicles" INTEGER NOT NULL DEFAULT 5,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Convoy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConvoyMember" (
    "id" TEXT NOT NULL,
    "convoyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "role" "ConvoyRole" NOT NULL DEFAULT 'driver',
    "status" "MemberStatus" NOT NULL DEFAULT 'invited',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConvoyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "convoyId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speedKph" DOUBLE PRECISION NOT NULL,
    "headingDeg" DOUBLE PRECISION NOT NULL,
    "accuracyMeters" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteCheckpoint" (
    "id" TEXT NOT NULL,
    "convoyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "sequence" INTEGER NOT NULL,
    "etaAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "convoyId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "vehicleId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceChannel" (
    "id" TEXT NOT NULL,
    "convoyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelType" "VoiceChannelType" NOT NULL DEFAULT 'main',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "livekitRoom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyRecording" (
    "id" TEXT NOT NULL,
    "convoyId" TEXT NOT NULL,
    "status" "JourneyStatus" NOT NULL DEFAULT 'recording',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "summary" JSONB,

    CONSTRAINT "JourneyRecording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyEvent" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT,
    "userId" TEXT,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "metadata" JSONB,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "PlanCode" NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerCustomerId" TEXT,
    "providerSubId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'checkout_pending',
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerRef" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdImpression" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "convoyId" TEXT,
    "placement" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "revenueMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdImpression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubMember" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ConvoyRole" NOT NULL DEFAULT 'driver',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubConvoy" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "convoyId" TEXT NOT NULL,

    CONSTRAINT "ClubConvoy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "Vehicle_userId_idx" ON "Vehicle"("userId");

-- CreateIndex
CREATE INDEX "Vehicle_type_idx" ON "Vehicle"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Convoy_inviteCode_key" ON "Convoy"("inviteCode");

-- CreateIndex
CREATE INDEX "Convoy_ownerId_createdAt_idx" ON "Convoy"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Convoy_status_updatedAt_idx" ON "Convoy"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Convoy_visibility_status_idx" ON "Convoy"("visibility", "status");

-- CreateIndex
CREATE INDEX "ConvoyMember_userId_idx" ON "ConvoyMember"("userId");

-- CreateIndex
CREATE INDEX "ConvoyMember_vehicleId_idx" ON "ConvoyMember"("vehicleId");

-- CreateIndex
CREATE INDEX "ConvoyMember_convoyId_status_idx" ON "ConvoyMember"("convoyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConvoyMember_convoyId_userId_key" ON "ConvoyMember"("convoyId", "userId");

-- CreateIndex
CREATE INDEX "LocationPing_convoyId_capturedAt_idx" ON "LocationPing"("convoyId", "capturedAt");

-- CreateIndex
CREATE INDEX "LocationPing_vehicleId_capturedAt_idx" ON "LocationPing"("vehicleId", "capturedAt");

-- CreateIndex
CREATE INDEX "LocationPing_receivedAt_idx" ON "LocationPing"("receivedAt");

-- CreateIndex
CREATE INDEX "RouteCheckpoint_convoyId_idx" ON "RouteCheckpoint"("convoyId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteCheckpoint_convoyId_sequence_key" ON "RouteCheckpoint"("convoyId", "sequence");

-- CreateIndex
CREATE INDEX "Alert_convoyId_createdAt_idx" ON "Alert"("convoyId", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_severity_acknowledgedAt_idx" ON "Alert"("severity", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "Alert_type_createdAt_idx" ON "Alert"("type", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceChannel_convoyId_channelType_idx" ON "VoiceChannel"("convoyId", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyRecording_convoyId_key" ON "JourneyRecording"("convoyId");

-- CreateIndex
CREATE INDEX "JourneyRecording_status_startedAt_idx" ON "JourneyRecording"("status", "startedAt");

-- CreateIndex
CREATE INDEX "JourneyEvent_journeyId_capturedAt_idx" ON "JourneyEvent"("journeyId", "capturedAt");

-- CreateIndex
CREATE INDEX "JourneyEvent_type_capturedAt_idx" ON "JourneyEvent"("type", "capturedAt");

-- CreateIndex
CREATE INDEX "MediaAsset_journeyId_createdAt_idx" ON "MediaAsset"("journeyId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_type_createdAt_idx" ON "MediaAsset"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

-- CreateIndex
CREATE INDEX "Subscription_provider_providerSubId_idx" ON "Subscription"("provider", "providerSubId");

-- CreateIndex
CREATE INDEX "Payment_subscriptionId_createdAt_idx" ON "Payment"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_provider_providerRef_idx" ON "Payment"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "AdImpression_placement_createdAt_idx" ON "AdImpression"("placement", "createdAt");

-- CreateIndex
CREATE INDEX "AdImpression_convoyId_createdAt_idx" ON "AdImpression"("convoyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

-- CreateIndex
CREATE INDEX "Club_ownerId_idx" ON "Club"("ownerId");

-- CreateIndex
CREATE INDEX "Club_isPublic_createdAt_idx" ON "Club"("isPublic", "createdAt");

-- CreateIndex
CREATE INDEX "ClubMember_userId_idx" ON "ClubMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubMember_clubId_userId_key" ON "ClubMember"("clubId", "userId");

-- CreateIndex
CREATE INDEX "ClubConvoy_convoyId_idx" ON "ClubConvoy"("convoyId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubConvoy_clubId_convoyId_key" ON "ClubConvoy"("clubId", "convoyId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_subjectType_subjectId_idx" ON "Report"("subjectType", "subjectId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Convoy" ADD CONSTRAINT "Convoy_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Convoy" ADD CONSTRAINT "Convoy_leaderUserId_fkey" FOREIGN KEY ("leaderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoyMember" ADD CONSTRAINT "ConvoyMember_convoyId_fkey" FOREIGN KEY ("convoyId") REFERENCES "Convoy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoyMember" ADD CONSTRAINT "ConvoyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoyMember" ADD CONSTRAINT "ConvoyMember_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_convoyId_fkey" FOREIGN KEY ("convoyId") REFERENCES "Convoy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteCheckpoint" ADD CONSTRAINT "RouteCheckpoint_convoyId_fkey" FOREIGN KEY ("convoyId") REFERENCES "Convoy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_convoyId_fkey" FOREIGN KEY ("convoyId") REFERENCES "Convoy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceChannel" ADD CONSTRAINT "VoiceChannel_convoyId_fkey" FOREIGN KEY ("convoyId") REFERENCES "Convoy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyRecording" ADD CONSTRAINT "JourneyRecording_convoyId_fkey" FOREIGN KEY ("convoyId") REFERENCES "Convoy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "JourneyRecording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "JourneyRecording"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMember" ADD CONSTRAINT "ClubMember_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMember" ADD CONSTRAINT "ClubMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubConvoy" ADD CONSTRAINT "ClubConvoy_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubConvoy" ADD CONSTRAINT "ClubConvoy_convoyId_fkey" FOREIGN KEY ("convoyId") REFERENCES "Convoy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
