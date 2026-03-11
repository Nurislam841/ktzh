-- CreateEnum
CREATE TYPE "ktz"."CrewCallStatus" AS ENUM ('PLANNED', 'NOTIFIED', 'CONFIRMED', 'MISSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ktz"."CrewCall" (
    "id" TEXT NOT NULL,
    "trainRunId" TEXT NOT NULL,
    "crewId" TEXT,
    "generatedFromVersionId" TEXT,
    "mustReportAt" TIMESTAMP(3) NOT NULL,
    "acceptedLocomotiveAt" TIMESTAMP(3) NOT NULL,
    "status" "ktz"."CrewCallStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrewCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrewCall_trainRunId_generatedFromVersionId_key" ON "ktz"."CrewCall"("trainRunId", "generatedFromVersionId");

-- CreateIndex
CREATE INDEX "CrewCall_status_mustReportAt_idx" ON "ktz"."CrewCall"("status", "mustReportAt");

-- CreateIndex
CREATE INDEX "CrewCall_crewId_mustReportAt_idx" ON "ktz"."CrewCall"("crewId", "mustReportAt");

-- AddForeignKey
ALTER TABLE "ktz"."CrewCall" ADD CONSTRAINT "CrewCall_trainRunId_fkey" FOREIGN KEY ("trainRunId") REFERENCES "ktz"."TrainRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ktz"."CrewCall" ADD CONSTRAINT "CrewCall_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "ktz"."Crew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ktz"."CrewCall" ADD CONSTRAINT "CrewCall_generatedFromVersionId_fkey" FOREIGN KEY ("generatedFromVersionId") REFERENCES "ktz"."ScheduleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
