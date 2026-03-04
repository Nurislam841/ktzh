import { NestFactory } from '@nestjs/core';
import * as path from 'node:path';
import { AppModule } from '../src/app.module';
import { ImportDataService } from '../src/modules/import-data/import-data.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['log', 'warn', 'error'],
    });

    try {
        const customDataDir = process.argv[2];
        const dataDir = customDataDir
            ? path.resolve(customDataDir)
            : path.resolve(process.cwd(), 'data');

        const importer = app.get(ImportDataService);
        const result = await importer.importAll(dataDir);

        console.log(JSON.stringify(result, null, 2));
    } finally {
        await app.close();
    }
}

bootstrap().catch((error) => {
    console.error('import:data failed', error);
    process.exit(1);
});

