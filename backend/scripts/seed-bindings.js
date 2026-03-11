/**
 * Seed script: parse KTZ binding calendar Excel files 
 * and POST them into BindingPlan via the API.
 *
 * Format per sheet:
 *   Row 0: month name
 *   Row 1: station name, then day numbers (14, 15, 16, ...)
 *   Row 2: (day-of-week labels, ignored)
 *   Rows 3+: groups of 5 rows, each group = one binding pair:
 *     [0] "отцепка лок-ва от поезда" — arrival train number
 *     [1] "вр.прибытие поезда"       — arrival time (Excel serial fraction)
 *     [2] "прицепка лок-ва к поезду" — departure train number
 *     [3] "время отправления поезда" — departure time (Excel serial)
 *     [4] "время простоя локомотива" — dwell (hours as fraction)
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const API = process.env.API_URL || 'http://localhost:3001';
const DATA_ROOT = path.resolve(__dirname, '../data');

const MONTH_MAP = {
    'январь': 0, 'февраль': 1, 'март': 2, 'апрель': 3,
    'май': 4, 'июнь': 5, 'июль': 6, 'август': 7,
    'сентябрь': 8, 'октябрь': 9, 'ноябрь': 10, 'декабрь': 11,
};

function excelTimeToMinutes(serial) {
    if (typeof serial !== 'number') return 0;
    // If > 1, it's already in hours (dwell)
    if (serial > 1) return Math.round(serial * 60);
    // Otherwise it's a day fraction: 0.5 = 12:00
    return Math.round(serial * 24 * 60);
}

function excelTimeToHHMM(serial) {
    if (typeof serial !== 'number') return null;
    const totalMin = Math.round((serial % 1) * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseSheet(sheetData, sheetName, filePath) {
    const bindings = [];

    if (sheetData.length < 4) return bindings;

    // Row 0: month
    const monthRaw = String(sheetData[0][0] || '').toLowerCase().trim();
    // Row 1: station + day numbers
    const stationName = String(sheetData[1][0] || '').trim();
    const dayNumbers = sheetData[1].slice(1).map(Number).filter(n => n > 0);

    // Determine year from sheet name or file path
    let year = 2026;
    const yearMatch = (filePath + ' ' + sheetName).match(/20\d{2}/);
    if (yearMatch) year = parseInt(yearMatch[0]);

    // Determine month
    let month = -1;
    for (const [name, idx] of Object.entries(MONTH_MAP)) {
        if (monthRaw.includes(name)) { month = idx; break; }
    }
    // Try sheet name
    if (month < 0) {
        for (const [name, idx] of Object.entries(MONTH_MAP)) {
            if (sheetName.toLowerCase().includes(name)) { month = idx; break; }
        }
    }
    if (month < 0) {
        // Guess from day numbers + sheet name
        const m = sheetName.match(/(\d{2})\.(\d{2})/);
        if (m) month = parseInt(m[1]) - 1;
    }
    if (month < 0) month = 0; // fallback

    // If month is December and year reference is 2026, it's probably Dec 2025
    if (month === 11 && sheetName.includes('25')) year = 2025;

    const periodId = `${year}-${String(month + 1).padStart(2, '0')}`;

    // Parse binding groups (5 rows each), starting from row 3
    for (let r = 3; r + 4 < sheetData.length; r += 5) {
        const arrTrainRow = sheetData[r];
        const arrTimeRow = sheetData[r + 1];
        const depTrainRow = sheetData[r + 2];
        const depTimeRow = sheetData[r + 3];
        const dwellRow = sheetData[r + 4];

        // Verify labels
        const label0 = String(arrTrainRow[0] || '').toLowerCase();
        if (!label0.includes('отцепка') && !label0.includes('поезд')) continue;

        // For each day column
        for (let c = 0; c < dayNumbers.length; c++) {
            const colIdx = c + 1;
            const day = dayNumbers[c];
            const arrTrain = arrTrainRow[colIdx];
            const arrTime = arrTimeRow[colIdx];
            const depTrain = depTrainRow[colIdx];
            const depTime = depTimeRow[colIdx];
            const dwell = dwellRow[colIdx];

            // Skip empty cells
            if (!arrTrain && !depTrain) continue;

            // Build date
            let arrivalDt = null;
            let departureDt = null;
            try {
                if (arrTrain && typeof arrTime === 'number') {
                    const timeStr = excelTimeToHHMM(arrTime);
                    if (timeStr) {
                        arrivalDt = new Date(year, month, day);
                        const totalMin = Math.round((arrTime % 1) * 24 * 60);
                        arrivalDt.setHours(Math.floor(totalMin / 60), totalMin % 60);
                    }
                }
                if (depTrain && typeof depTime === 'number') {
                    const timeStr = excelTimeToHHMM(depTime);
                    if (timeStr) {
                        departureDt = new Date(year, month, day);
                        const totalMin = Math.round((depTime % 1) * 24 * 60);
                        departureDt.setHours(Math.floor(totalMin / 60), totalMin % 60);
                    }
                }
            } catch { continue; }

            // Calculate dwell in minutes
            let dwellMinutes = 0;
            if (typeof dwell === 'number') {
                dwellMinutes = dwell > 1
                    ? Math.round(dwell * 60)  // already hours
                    : Math.round(dwell * 24 * 60); // day fraction
            }

            bindings.push({
                periodId,
                stationName,
                arrivalTrainNumber: arrTrain ? String(arrTrain) : null,
                departureTrainNumber: depTrain ? String(depTrain) : null,
                arrivalDt: arrivalDt?.toISOString() ?? null,
                departureDt: departureDt?.toISOString() ?? null,
                dwellMinutes,
                day,
                source: path.basename(filePath),
            });
        }
    }
    return bindings;
}

function parseFile(filePath) {
    const wb = xlsx.readFile(filePath);
    const results = [];
    for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
        results.push(...parseSheet(data, sheetName, filePath));
    }
    return results;
}

function findAllXlsx(dir) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...findAllXlsx(full));
        else if (/\.xlsx?$/i.test(entry.name) && !entry.name.startsWith('~')) files.push(full);
    }
    return files;
}

async function main() {
    const bindingDirs = [
        path.join(DATA_ROOT, 'Подвязки 2025-2026'),
        path.join(DATA_ROOT, 'Подвязки 2024-2025'),
    ];

    let totalParsed = 0;
    let totalCreated = 0;
    let errors = 0;
    const allBindings = [];

    for (const dir of bindingDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = findAllXlsx(dir);
        console.log(`📁 ${path.basename(dir)}: ${files.length} файлов`);

        for (const f of files) {
            try {
                const parsed = parseFile(f);
                totalParsed += parsed.length;
                allBindings.push(...parsed);
                console.log(`  ✓ ${path.relative(DATA_ROOT, f)}: ${parsed.length} подвязок`);
            } catch (err) {
                errors++;
                console.error(`  ✗ ${path.relative(DATA_ROOT, f)}: ${err.message}`);
            }
        }
    }

    console.log(`\n📊 Итого распарсено: ${totalParsed} подвязок, ошибок: ${errors}`);

    // Resolve stations + trains, then create binding plans via Prisma directly
    // (faster than going through API for bulk)
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    try {
        // Get all stations and trains for resolution
        const stations = await prisma.station.findMany();
        const trains = await prisma.train.findMany();

        const stationMap = {};
        stations.forEach(s => {
            stationMap[s.name.toLowerCase()] = s.id;
            if (s.code) stationMap[s.code.toLowerCase()] = s.id;
        });

        const trainMap = {};
        trains.forEach(t => { trainMap[t.number] = t.id; });

        console.log(`\n🔗 Станций в БД: ${stations.length}, поездов: ${trains.length}`);

        for (const b of allBindings) {
            const stationId = stationMap[b.stationName.toLowerCase()];
            if (!stationId) continue;

            const arrTrainId = b.arrivalTrainNumber ? trainMap[b.arrivalTrainNumber] : null;
            const depTrainId = b.departureTrainNumber ? trainMap[b.departureTrainNumber] : null;
            if (!arrTrainId && !depTrainId) continue;

            try {
                await prisma.bindingPlan.create({
                    data: {
                        periodId: b.periodId,
                        turnaroundStationId: stationId,
                        arrivalTrainId: arrTrainId || null,
                        departureTrainId: depTrainId || null,
                        arrivalDt: b.arrivalDt ? new Date(b.arrivalDt) : new Date(),
                        departureDt: b.departureDt ? new Date(b.departureDt) : new Date(),
                        dwellMinutes: b.dwellMinutes || 0,
                        status: 'DRAFT',
                    },
                });
                totalCreated++;
            } catch (err) {
                // Unique constraint or missing FK — skip
                if (!err.message.includes('Unique constraint')) {
                    // silent
                }
            }
        }

        console.log(`\n✅ Создано подвязок в БД: ${totalCreated}`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
