import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Seo Platform API')
    .setDescription('Çok kiracılı SEO takip ve otomasyon platformu API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token', undefined, 'refresh_token')
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication, path = 'api/docs'): void {
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup(path, app, document);
}
