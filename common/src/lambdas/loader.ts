import { injectLambdaContext } from "@aws-lambda-powertools/logger";
import { LogLevel } from "@aws-lambda-powertools/logger/lib/types/Log.js";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer";
import * as en_US from "@faker-js/faker/locale/en_US";
import middy from "@middy/core";
import { z } from "zod";

import { getPersonService } from "../db/db.js";
import { Person, personSchema } from "../types/person.js";
import { configO11Y } from "../utils/o11y.js";

const envSchema = z.object({
  SCENARIO: z.string(),
  LOG_LEVEL: z.custom<LogLevel>(),
  TABLE_NAME: z.string(),
});

const lambdaRunConfigEventSchema = z.object({
  count: z.number(),
});
type LambdaRunConfigEvent = z.infer<typeof lambdaRunConfigEventSchema>;

const envParsed = envSchema.parse(process.env);

const { logger, tracer } = configO11Y(envParsed.SCENARIO, envParsed.LOG_LEVEL);

const tableName = envParsed.TABLE_NAME;

const faker = en_US.faker;

const lambdaHandler = async (event: LambdaRunConfigEvent) => {
  logger.appendKeys({ scenario: envParsed.SCENARIO });
  logger.appendKeys({ tableName: tableName });
  logger.appendKeys({ logLevelEnv: envParsed.LOG_LEVEL });
  logger.debug("Received event", { event });

  const runtimeConfig = lambdaRunConfigEventSchema.parse(event);

  const personService = getPersonService(tableName, logger);

  for (let i = 0; i < runtimeConfig.count; i++) {
    faker.seed(i);
    const person: Person = personSchema.parse({
      personId: faker.string.uuid(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email(),
    });
    logger.debug("Generated person", { person });

    try {
      const result = await personService.entities.person.create(person).go();
      logger.debug("Created person", { result });
    } catch (error) {
      logger.error("Failed to create person", { error });
    }
  }
};

export const handler = middy(lambdaHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer));
