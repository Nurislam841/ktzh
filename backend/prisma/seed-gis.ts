import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// This script expects that the user has already run the main data importer 
// (or the system imported stations from the /data folder).
// It updates the latitude and longitude of REAL KTZ stations found in the DB.
async function main() {
    console.log('Applying GIS Coordinates to real KTZ stations...');

    const stationCoordinates = [
        { match: 'астан', code: 'AST', latitude: 51.1264, longitude: 71.4301 },
        { match: 'алмат', code: 'ALA', latitude: 43.2389, longitude: 76.8897 },
        { match: 'шымкент', code: 'CIT', latitude: 42.3417, longitude: 69.5901 },
        { match: 'караганд', code: 'KGF', latitude: 49.8019, longitude: 73.0898 },
        { match: 'актобе', code: 'AKX', latitude: 50.3004, longitude: 57.1546 },
        { match: 'тараз', code: 'DMB', latitude: 42.9000, longitude: 71.3667 },
        { match: 'павлодар', code: 'PWQ', latitude: 52.3156, longitude: 76.9675 },
        { match: 'семей', code: 'PLX', latitude: 50.4111, longitude: 80.2275 },
        { match: 'атырау', code: 'GUW', latitude: 47.1000, longitude: 51.9167 },
        { match: 'кызылорд', code: 'KZO', latitude: 44.8486, longitude: 65.4997 },
        { match: 'костанай', code: 'KSN', latitude: 53.2144, longitude: 63.6246 },
        { match: 'орал', code: 'URA', latitude: 51.2000, longitude: 51.3667 },
        { match: 'петропавл', code: 'PPK', latitude: 54.8667, longitude: 69.1500 },
        { match: 'актау', code: 'SCO', latitude: 43.6481, longitude: 51.1361 },
        { match: 'туркестан', code: 'HSA', latitude: 43.2973, longitude: 68.2518 },
        { match: 'достык', code: 'DTK', latitude: 45.2342, longitude: 82.4831 },
        { match: 'сарыагаш', code: 'SRY', latitude: 41.4554, longitude: 69.1672 },
        { match: 'мангистау', code: 'MNG', latitude: 43.6890, longitude: 51.1578 },
        { match: 'чу', code: 'CHU', latitude: 43.5983, longitude: 73.7616 },
        { match: 'шу', code: 'SHU', latitude: 43.5983, longitude: 73.7616 }, // Alternative spelling
    ];

    let updatedCount = 0;

    for (const coords of stationCoordinates) {
        let station = await prisma.station.findUnique({
            where: { code: coords.code }
        });

        if (!station) {
            station = await prisma.station.findFirst({
                where: { name: { contains: coords.match, mode: 'insensitive' } }
            });
        }

        if (station) {
            await prisma.station.update({
                where: { id: station.id },
                data: {
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    code: coords.code
                }
            });
            updatedCount++;
            console.log(`Updated station: ${station.name}`);
        } else {
            // Create an explicit node if missing so the map still works out of the box
            station = await prisma.station.create({
                data: {
                    name: coords.match.charAt(0).toUpperCase() + coords.match.slice(1) + " (Узел)",
                    code: coords.code,
                    latitude: coords.latitude,
                    longitude: coords.longitude
                }
            });
            updatedCount++;
            console.log(`Created new station node: ${station.name}`);
        }

        const locoCount = (['AST', 'ALA', 'KGF'].includes(coords.code)) ?
            Math.floor(Math.random() * 3) + 4 : Math.floor(Math.random() * 3) + 0;

        await prisma.locomotive.deleteMany({
            where: { locationStationId: station.id }
        });

        for (let i = 0; i < locoCount; i++) {
            await prisma.locomotive.create({
                data: {
                    series: 'ВЛ80',
                    number: `${coords.code}-${Math.floor(Math.random() * 1000)}`,
                    depotId: 'default-depot',
                    locationStationId: station.id,
                    status: Math.random() > 0.3 ? 'AVAILABLE' : 'ASSIGNED'
                }
            });
        }
    }

    console.log(`GIS Seeding finished. Updated ${updatedCount} real stations with coordinates.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
