import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Генерация тестовых поездов для реальных станций...');

  // Найдем ВСЕ станции, чтобы заполнить их данными
  const stations = await prisma.station.findMany();

  if (stations.length < 2) {
    console.log('Станции не найдены. Сначала запустите скрипт добавления локомотивов.');
    return;
  }

  let trainsCreated = 0;

  for (const station of stations) {
    // Создаем 3-5 случайных поездов для каждой станции, ожидающих локомотив
    const numTrains = Math.floor(Math.random() * 3) + 3; 
    for (let i = 0; i < numTrains; i++) {
       const isPassenger = Math.random() > 0.5;
       const destStation = stations.find(s => s.id !== station.id) || station;
       
       const train = await prisma.train.create({
         data: {
           number: `${Math.floor(Math.random() * 9000) + 1000}${isPassenger ? 'П' : 'Г'}-${station.name.substring(0,3)}`,
           priority: isPassenger ? 'PASSENGER' : 'FREIGHT',
           wagons: isPassenger ? 15 : 100, // Г > 5000 требует грузового локомотива (100 * 60 = 6000 тонн)
         }
       });

       await prisma.trainRun.create({
         data: {
           trainId: train.id,
           originStationId: station.id,
           destinationStationId: destStation.id,
           status: 'PLANNED', // Ожидает локомотива
           scheduledArrival: new Date(Date.now() - Math.floor(Math.random() * 2 * 60 * 60 * 1000)), // Прибыл от 0 до 2 часов назад
           scheduledDeparture: new Date(Date.now() + Math.floor(Math.random() * 6 * 60 * 60 * 1000)), // Отправка через 1-6 часов
         }
       });
       trainsCreated++;
    }
  }

  console.log(`Успешно создано ${trainsCreated} тестовых поездов для подвязки!`);
  console.log('Теперь оптимизатор сможет находить пары "Локомотив + Поезд".');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
