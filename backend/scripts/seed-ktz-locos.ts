import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Дані парка локомотивов ТОО "КТЖ-Пассажирские локомотивы" (фрагмент)
const locosData = [
  // Электровозы серии KZ4A(AC)
  { series: 'KZ4Ac', start: 6, end: 7, depot: 'ТЛ-20', location: 'Тобол' },
  { series: 'KZ4Ac', start: 8, end: 9, depot: 'ТЛ-11', location: 'Астана' },
  { series: 'KZ4Ac', number: '0010', depot: 'ТЛ-20', location: 'Тобол' },
  { series: 'KZ4Ac', start: 11, end: 15, depot: 'ТЛ-11', location: 'Астана' },
  { series: 'KZ4Ac', start: 16, end: 17, depot: 'ТЛ-20', location: 'Тобол' },
  { series: 'KZ4Ac', start: 18, end: 21, depot: 'ТЛ-11', location: 'Астана' },
  { series: 'KZ4Ac', start: 22, end: 23, depot: 'ТЛ-20', location: 'Тобол' },
  { series: 'KZ4Ac', start: 24, end: 25, depot: 'ТЛ-11', location: 'Астана' },
  { series: 'KZ4Ac', start: 26, end: 27, depot: 'ТЛ-14', location: 'Караганда' },

  // Электровозы серии KZ4AT
  { series: 'KZ4Aт', start: 1, end: 12, depot: 'ТЛ-11', location: 'Астана' },
  { series: 'KZ4Aт', start: 13, end: 32, depot: 'ТЛ-31', location: 'Жамбыл' },
  { series: 'KZ4Aт', start: 33, end: 39, depot: 'ТЛ-14', location: 'Караганда' },
  { series: 'KZ4Aт', number: '0040', depot: 'ТЛ-11', location: 'Астана' },
  { series: 'KZ4Aт', number: '0041', depot: 'ТЛ-14', location: 'Караганда' },
  { series: 'KZ4Aт', number: '0042', depot: 'ТЛ-28', location: 'Алматы' },
  { series: 'KZ4Aт', number: '0043', depot: 'ТЛ-14', location: 'Караганда' },
  { series: 'KZ4Aт', number: '0044', depot: 'ТЛ-11', location: 'Астана' },
  { series: 'KZ4Aт', start: 45, end: 47, depot: 'ТЛ-31', location: 'Жамбыл' },
  { series: 'KZ4Aт', start: 48, end: 54, depot: 'ТЛ-11', location: 'Астана' },
  { series: 'KZ4Aт', start: 55, end: 56, depot: 'ТЛ-28', location: 'Алматы' },
  { series: 'KZ4Aт', start: 57, end: 82, depot: 'ТЛ-11', location: 'Астана' },
  
  // Тепловозы серии ТЭП33А
  { series: 'ТЭП33А', number: '0001', depot: 'ТЛ-20', location: 'Тобол' },
  { series: 'ТЭП33А', start: 2, end: 3, depot: 'ТЛ-36', location: 'Сексеул' },
  { series: 'ТЭП33А', number: '0004', depot: 'ТЛ-4', location: 'Макат' },
  { series: 'ТЭП33А', number: '0005', depot: 'ТЛ-2', location: 'Актобе' },
  { series: 'ТЭП33А', number: '0006', depot: 'ТЛ-4', location: 'Макат' },
  { series: 'ТЭП33А', start: 7, end: 9, depot: 'ТЛ-2', location: 'Актобе' },
  { series: 'ТЭП33А', number: '0010', depot: 'ТЛ-36', location: 'Сексеул' },
  { series: 'ТЭП33А', start: 11, end: 12, depot: 'ТЛ-20', location: 'Тобол' },
  { series: 'ТЭП33А', number: '0013', depot: 'ТЛ-4', location: 'Макат' },
  { series: 'ТЭП33А', number: '0014', depot: 'ТЛ-20', location: 'Тобол' },
  { series: 'ТЭП33А', number: '0015', depot: 'ТЛ-4', location: 'Макат' },
  { series: 'ТЭП33А', number: '0016', depot: 'ТЛ-2', location: 'Актобе' },
  { series: 'ТЭП33А', start: 17, end: 20, depot: 'ТЛ-4', location: 'Макат' },
  { series: 'ТЭП33А', start: 21, end: 24, depot: 'ТЛ-11', location: 'Кокшетау' },
  { series: 'ТЭП33А', start: 25, end: 26, depot: 'ТЛ-36', location: 'Сексеул' },
  { series: 'ТЭП33А', start: 27, end: 28, depot: 'ТЛ-25', location: 'Аягоз' },
  { series: 'ТЭП33А', number: '0029', depot: 'ТЛ-20', location: 'Тобол' },
  { series: 'ТЭП33А', start: 30, end: 37, depot: 'ТЛ-25', location: 'Аягоз' },
  { series: 'ТЭП33А', start: 38, end: 39, depot: 'ТЛ-36', location: 'Сексеул' },
  { series: 'ТЭП33А', number: '0040', depot: 'ТЛ-28', location: 'Алматы' },
  { series: 'ТЭП33А', start: 41, end: 43, depot: 'ТЛ-36', location: 'Сексеул' },
  { series: 'ТЭП33А', start: 44, end: 53, depot: 'ТЛ-28', location: 'Алматы' },
  { series: 'ТЭП33А', start: 54, end: 57, depot: 'ТЛ-20', location: 'Кустанай' },
  { series: 'ТЭП33А', start: 58, end: 60, depot: 'ТЛ-28', location: 'Алматы' },
  { series: 'ТЭП33А', start: 61, end: 62, depot: 'ТЛ-20', location: 'Есиль' },
  { series: 'ТЭП33А', start: 63, end: 83, depot: 'ТЛ-36', location: 'Сексеул' },
];

function padNumber(num: number): string {
  return num.toString().padStart(4, '0');
}

async function main() {
  console.log('Начинаем импорт реального парка пассажирских локомотивов КТЖ...');

  const depotsMap = new Map();
  const stationsMap = new Map();

  // Развертываем диапазоны
  for (const block of locosData) {
    const locosToCreate = [];
    if (block.start && block.end) {
      for (let i = block.start; i <= block.end; i++) {
        locosToCreate.push(padNumber(i));
      }
    } else if (block.number) {
      locosToCreate.push(block.number);
    }

    for (const number of locosToCreate) {
       // 1. Создаем Депо если нет
       let depotId = depotsMap.get(block.depot);
       if (!depotId) {
          const depot = await prisma.depot.create({
             data: { name: block.depot }
          });
          depotId = depot.id;
          depotsMap.set(block.depot, depotId);
       }

       // 2. Создаем Станцию если нет
       let stationId = stationsMap.get(block.location);
       if (!stationId) {
          const stationName = block.location;
          const station = await prisma.station.create({
             data: { 
                 name: stationName,
                 // Генерируем тестовый код, если надо
                 code: `ST-${Math.random().toString(36).substr(2, 5).toUpperCase()}`
             }
          });
          stationId = station.id;
          stationsMap.set(stationName, stationId);
       }

       // 3. Добавляем Локомотив
       await prisma.locomotive.create({
         data: {
           series: block.series,
           number: number,
           depotId: depotId,
           locationStationId: stationId,
           status: 'AVAILABLE',
           // Делаем локомотивы готовыми к работе +- в случайное время от "сейчас" до "+12 часов"
           availableFrom: new Date(Date.now() + Math.floor(Math.random() * 12 * 60 * 60 * 1000)),
         }
       });
    }
  }

  console.log('Парк локомотивов успешно загружен:');
  console.log(`- Создано ${depotsMap.size} депо.`);
  console.log(`- Создано ${stationsMap.size} станций.`);
  console.log('Готово! Вы можете проверять их в дашборде.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
