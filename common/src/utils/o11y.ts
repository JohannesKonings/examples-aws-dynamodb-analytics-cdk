import { Logger } from "@aws-lambda-powertools/logger";
import { LogLevel } from "@aws-lambda-powertools/logger/lib/types/Log.js";
import { Tracer } from "@aws-lambda-powertools/tracer";

import { dynamoDBClient } from "../db/db.js";

const configO11Y = (serviceName: string, logLevel: LogLevel) => {
  const logger = new Logger({ serviceName: serviceName, logLevel: logLevel });

  const tracer = new Tracer({
    serviceName: serviceName,
  });
  tracer.captureAWSv3Client(dynamoDBClient);

  return { logger, tracer };
};

export { configO11Y };
