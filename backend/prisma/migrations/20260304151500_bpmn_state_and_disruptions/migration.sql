-- CreateEnum
CREATE TYPE "ktz"."DepartureSlotStatus" AS ENUM ('IMMEDIATE', 'ASSIGNED', 'WAITING_QUEUE');

-- CreateEnum
CREATE TYPE "ktz"."ScheduleApprovalMode" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "ktz"."ScheduleApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
BEGIN;
CREATE TYPE "ktz"."LocomotiveStatus_new" AS ENUM ('AVAILABLE', 'ASSIGNED', 'IN_TRANSIT', 'MAINTENANCE');
ALTER TABLE "ktz"."Locomotive" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ktz"."Locomotive" ALTER COLUMN "status" TYPE "ktz"."LocomotiveStatus_new" USING (
  CASE
    WHEN "status"::text = 'EN_ROUTE' THEN 'IN_TRANSIT'::"ktz"."LocomotiveStatus_new"
    WHEN "status"::text = 'FAILED' THEN 'MAINTENANCE'::"ktz"."LocomotiveStatus_new"
    ELSE "status"::text::"ktz"."LocomotiveStatus_new"
  END
);
ALTER TYPE "ktz"."LocomotiveStatus" RENAME TO "LocomotiveStatus_old";
ALTER TYPE "ktz"."LocomotiveStatus_new" RENAME TO "LocomotiveStatus";
DROP TYPE "ktz"."LocomotiveStatus_old";
ALTER TABLE "ktz"."Locomotive" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ktz"."OperationalEventType" ADD VALUE 'TRACK_CLOSURE';
ALTER TYPE "ktz"."OperationalEventType" ADD VALUE 'CREW_ABSENCE';
ALTER TYPE "ktz"."OperationalEventType" ADD VALUE 'LATE_TRAIN';
ALTER TYPE "ktz"."OperationalEventType" ADD VALUE 'MAINTENANCE';
ALTER TYPE "ktz"."OperationalEventType" ADD VALUE 'WEATHER';
ALTER TYPE "ktz"."OperationalEventType" ADD VALUE 'CAPACITY_CONFLICT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ktz"."TrainRunStatus" ADD VALUE 'READY';
ALTER TYPE "ktz"."TrainRunStatus" ADD VALUE 'WAITING_SLOT';
ALTER TYPE "ktz"."TrainRunStatus" ADD VALUE 'LOCO_ASSIGNED';
ALTER TYPE "ktz"."TrainRunStatus" ADD VALUE 'CREW_CONFIRMED';
ALTER TYPE "ktz"."TrainRunStatus" ADD VALUE 'DELAYED';

-- AlterTable
ALTER TABLE "ktz"."Allocation" ADD COLUMN     "slotStatus" "ktz"."DepartureSlotStatus" NOT NULL DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "ktz"."ScheduleVersion" ADD COLUMN     "approvalMode" "ktz"."ScheduleApprovalMode" NOT NULL DEFAULT 'AUTOMATIC',
ADD COLUMN     "approvalStatus" "ktz"."ScheduleApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT;
