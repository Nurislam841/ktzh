import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Создание базовых версий расписания для станций...');

  const stations = await prisma.station.findMany();

  let count = 0;
  for (const station of stations) {
    // Проверяем, есть ли поезда на этой станции
    const trains = await prisma.trainRun.findMany({
      where: { originStationId: station.id }
    });

    if (trains.length === 0) continue;

    // Создаем версию
    const version = await prisma.scheduleVersion.create({
      data: {
        stationId: station.id,
        reason: 'Начальный импорт KTZ-ПЛ парка',
        approvalMode: 'AUTOMATIC',
        approvalStatus: 'APPROVED'
      }
    });

    // Создаем аллокации для каждого поезда
    for (const train of trains) {
      await prisma.allocation.create({
        data: {
          scheduleVersionId: version.id,
          trainRunId: train.id,
          plannedDeparture: train.scheduledDeparture,
          plannedArrival: train.scheduledArrival,
          slotStatus: 'ASSIGNED',
          notes: 'Импортировано автоматически'
        }
      });
    }

    // Добавим пару фиктивных путей для станции, чтобы они отображались
    const existingTracks = await prisma.track.count({ where: { stationId: station.id } });
    if (existingTracks === 0) {
       for(let i=1; i<=8; i++) {
          await prisma.track.create({
             data: {
                stationId: station.id,
                name: `Путь ${i}`,
                status: 'FREE',
             }
          });
       }
    }

    count++;
  }

  console.log(`Созданы версии расписания для ${count} станций. Дашборд теперь будет отображать данные!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
