import { PrismaClient, TrackStatus, LocomotiveStatus, CrewStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding station resources (Tracks, Crews, Locomotives)...');

    // Get major stations
    const stations = await prisma.station.findMany({
        take: 15
    });

    if (stations.length === 0) {
        console.log('No stations found.');
        return;
    }

    // Ensure we have at least one Depot
    let depot = await prisma.depot.findFirst();
    if (!depot) {
        depot = await prisma.depot.create({ data: { name: 'Главное Депо НС' } });
    }

    // Get all locomotives
    const allLocos = await prisma.locomotive.findMany();

    let trackCount = 0;
    let locoAssignedCount = 0;
    let crewCount = 0;

    for (const [index, station] of stations.entries()) {
        // 1. Create Tracks for this station (delete old ones first)
        await prisma.track.deleteMany({ where: { stationId: station.id } });

        const tracksToCreate = [
            { stationId: station.id, name: 'Главный путь (I)', status: TrackStatus.FREE },
            { stationId: station.id, name: 'Главный путь (II)', status: TrackStatus.FREE },
            { stationId: station.id, name: 'ПОП 3', status: TrackStatus.OCCUPIED },
            { stationId: station.id, name: 'ПОП 4', status: TrackStatus.FREE },
            { stationId: station.id, name: 'ПОП 5', status: index % 3 === 0 ? TrackStatus.MAINTENANCE : TrackStatus.FREE },
        ];
        await prisma.track.createMany({ data: tracksToCreate });
        trackCount += tracksToCreate.length;

        // 2. Assign some Locomotives to this station
        // Give each station 2-4 locos
        const locosForStation = allLocos.slice(index * 4, (index + 1) * 4);
        for (let i = 0; i < locosForStation.length; i++) {
            const loco = locosForStation[i];
            await prisma.locomotive.update({
                where: { id: loco.id },
                data: {
                    locationStationId: station.id,
                    status: i === 0 ? LocomotiveStatus.AVAILABLE : (i === 1 ? LocomotiveStatus.MAINTENANCE : LocomotiveStatus.AVAILABLE),
                    availableFrom: i === 0 ? new Date() : (i === 1 ? new Date(Date.now() + 1000 * 60 * 60 * 5) : new Date(Date.now() - 1000 * 60 * 60 * 2))
                }
            });
            locoAssignedCount++;
        }

        // 3. Create Crews for this station
        const crews = [
            { depotId: depot.id, status: CrewStatus.AVAILABLE, availableFrom: new Date() },
            { depotId: depot.id, status: CrewStatus.AVAILABLE, availableFrom: new Date(Date.now() - 1000 * 60 * 30) },
            { depotId: depot.id, status: CrewStatus.RESTING, availableFrom: new Date(Date.now() + 1000 * 60 * 60 * 8) },
        ];
        
        await prisma.crew.createMany({ data: crews });
        crewCount += crews.length;
    }

    // In a real app we'd map Crews to locationStationId, but Crew only has depotId. 
    // Wait, let me check if Crew has a locationStationId.
    // If it doesn't, the UI will just fetch crews from the depot associated with the station, or globally.
    // Let's check node.service.ts getResources.

    console.log(`✅ Seeded ${trackCount} tracks, placed ${locoAssignedCount} locos, created ${crewCount} crews.`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
