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
        .setTitle('KTZ API управления узлом')
        .setDescription('Система динамического перепланирования железнодорожного узла')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    const port = process.env.PORT ?? 3001;
    await app.listen(port);
    console.log(`KTZ Backend запущен: http://localhost:${port}`);
    console.log(`Swagger-документация: http://localhost:${port}/api/docs`);
}
bootstrap();
