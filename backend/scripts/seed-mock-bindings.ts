import { PrismaClient, BindingPlanStatus, MovementType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding mock binding plans...');
    const periodId = '2026-03';

    // Get major stations
    const stations = await prisma.station.findMany({
        take: 10
    });

    if (stations.length === 0) {
        console.log('No stations found. Cannot seed bindings.');
        return;
    }

    // Get passenger and freight trains
    const passTrains = await prisma.train.findMany({
        take: 30
    });
    
    const freightTrains = await prisma.train.findMany({
        skip: 30,
        take: 50
    });

    let created = 0;

    for (const station of stations) {
        // Create 3 passenger bindings
        for (let i = 0; i < 3; i++) {
            if (i * 2 + 1 >= passTrains.length) break;
            const arr = passTrains[i * 2];
            const dep = passTrains[i * 2 + 1];

            const arrivalDt = new Date(`2026-03-01T10:00:00Z`);
            arrivalDt.setHours(10 + i * 2);
            
            const departureDt = new Date(arrivalDt);
            departureDt.setHours(departureDt.getHours() + 2);

            try {
                await prisma.bindingPlan.create({
                    data: {
                        periodId,
                        turnaroundStationId: station.id,
                        arrivalTrainId: arr.id,
                        arrivalDt,
                        departureTrainId: dep.id,
                        departureDt,
                        dwellMinutes: 120,
                        status: i === 0 ? BindingPlanStatus.APPROVED : (i === 1 ? BindingPlanStatus.PLANNED : BindingPlanStatus.CONFLICT),
                        conflictReasonCode: i === 2 ? 'TIME_CONFLICT' : null,
                        conflictReasonDetails: i === 2 ? 'Пересечение по времени' : null,
                    }
                });
                created++;
            } catch (e) {
                // Ignore duplicates
            }
        }

        // Create 5 freight bindings
        for (let i = 0; i < 5; i++) {
            if (i * 2 + 1 >= freightTrains.length) break;
            const arr = freightTrains[i * 2];
            const dep = freightTrains[i * 2 + 1];

            const arrivalDt = new Date(`2026-03-03T12:00:00Z`);
            arrivalDt.setHours(12 + i * 3);
            
            const departureDt = new Date(arrivalDt);
            departureDt.setHours(departureDt.getHours() + 4);

            try {
                await prisma.bindingPlan.create({
                    data: {
                        periodId,
                        turnaroundStationId: station.id,
                        arrivalTrainId: arr.id,
                        arrivalDt,
                        departureTrainId: dep.id,
                        departureDt,
                        dwellMinutes: 240,
                        status: i === 0 ? BindingPlanStatus.DRAFT : (i === 1 ? BindingPlanStatus.VALIDATED : BindingPlanStatus.APPROVED),
                    }
                });
                created++;
            } catch (e) {
                // Ignore duplicates
            }
        }
    }

    console.log(`Successfully created ${created} mock binding plans for period ${periodId}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
