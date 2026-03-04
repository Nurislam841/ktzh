import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ImportDataService } from '../src/modules/import-data/import-data.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['log', 'warn', 'error'],
    });

    try {
        const importer = app.get(ImportDataService);
        const result = await importer.bootstrapOperationalData();
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await app.close();
    }
}

bootstrap().catch((error) => {
    console.error('bootstrap:ops failed', error);
    process.exit(1);
});

