import { Logger } from "@aws-lambda-powertools/logger";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { Attribute, ElectroEvent, Entity, Service } from "electrodb";
import { z } from "zod";

import { personSchema } from "../types/person.js";

const dynamoDBClient = new DynamoDBClient({});

const convertZodSchemaToElectroDbEntityAttributes = <T extends z.ZodRawShape>(
  zodSchema: z.ZodObject<T>
) => {
  const attributes: Record<string, Attribute> = {};

  for (const key in zodSchema.shape) {
    const zodType = zodSchema.shape[key];

    if (zodType instanceof z.ZodString) {
      attributes[key] = {
        type: "string",
        field: key,
      };
    } else if (zodType instanceof z.ZodNumber) {
      attributes[key] = {
        type: "number",
        field: key,
      };
    } // Add more cases as needed
  }

  return attributes;
};

const personAttributes =
  convertZodSchemaToElectroDbEntityAttributes(personSchema);
const getCurrentTimestamp = () => new Date().toISOString();

const PersonEntity = new Entity(
  {
    model: {
      entity: "person-entity",
      version: "1",
      service: "person-service",
    },
    attributes: {
      ...personAttributes,
      createdAt: {
        type: "string",
        readOnly: true,
        required: true,
        default: getCurrentTimestamp,
        set: getCurrentTimestamp,
      },
      updatedAt: {
        type: "string",
        watch: "*",
        required: true,
        default: getCurrentTimestamp,
        set: getCurrentTimestamp,
      },
    },
    // attributes: {
    //   personId: {
    //     type: "string",
    //     required: true,
    //   },
    //   firstName: {
    //     type: "string",
    //     required: true,
    //   },
    //   lastName: {
    //     type: "string",
    //     required: true,
    //   },
    // },
    indexes: {
      byLocation: {
        pk: {
          field: "pk",
          composite: ["personId"],
        },
        sk: {
          field: "sk",
          composite: [],
        },
      },
    },
  },
  { client: dynamoDBClient }
);

const getPersonService = (table: string, logger: Logger) => {
  const loggerElectroDb = (event: ElectroEvent) => {
    logger.debug("ElectroDB event", { event });
  };

  const PersonService = new Service(
    {
      person: PersonEntity,
    },
    { client: dynamoDBClient, table, logger: loggerElectroDb }
  );
  return PersonService;
};

export { dynamoDBClient, getPersonService };
