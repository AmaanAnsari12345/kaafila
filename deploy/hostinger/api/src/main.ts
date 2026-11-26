import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { RedisIoAdapter } from "./modules/realtime/redis-io.adapter";

async function bootstrap() {
  // rawBody is required to verify Razorpay and Stripe webhook signatures.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  const logger = new Logger("Bootstrap");
  const port = Number(process.env.PORT ?? 4000);
  const origins = (process.env.PUBLIC_APP_URL ?? "http://localhost:3000").split(",").map((o) => o.trim());

  app.set("trust proxy", 1);
  app.use(helmet());
  app.enableCors({ origin: origins, credentials: true });
  app.useBodyParser("json", { limit: "1mb" });
  app.setGlobalPrefix("v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.enableShutdownHooks();

  const redisAdapter = new RedisIoAdapter(app);
  await redisAdapter.connect();
  app.useWebSocketAdapter(redisAdapter);

  if (process.env.NODE_ENV !== "production" || process.env.ENABLE_API_DOCS === "true") {
    const config = new DocumentBuilder()
      .setTitle("KAAFILA API")
      .setDescription("Group-driving operating system: convoys, live tracking, intelligence, safety, garage, social, meetups, billing and admin.")
      .setVersion("0.2.0")
      .addBearerAuth()
      .build();
    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));
  }

  await app.listen(port);
  logger.log(`KAAFILA API listening on http://localhost:${port} (docs at /docs outside production)`);
}

void bootstrap();
