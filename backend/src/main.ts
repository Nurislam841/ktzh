import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.enableCors();

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: false,
        }),
    );

    const config = new DocumentBuilder()
        .setTitle('KTZ Railway Node API')
        .setDescription('Dynamic Railway Node Rescheduling System')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    const port = process.env.PORT ?? 3001;
    await app.listen(port);
    console.log(`🚂 KTZ Backend running on http://localhost:${port}`);
    console.log(`📖 Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
