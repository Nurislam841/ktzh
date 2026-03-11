-- CreateEnum
CREATE TYPE "ktz"."OperationScenario" AS ENUM ('FORMATION', 'TRANSIT');

-- AlterTable
ALTER TABLE "ktz"."TrainRun"
ADD COLUMN "operationScenario" "ktz"."OperationScenario" NOT NULL DEFAULT 'TRANSIT',
ADD COLUMN "requiresCrewChange" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "requiresLocoChange" BOOLEAN NOT NULL DEFAULT false;
