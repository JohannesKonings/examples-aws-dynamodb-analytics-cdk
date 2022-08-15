import { faker } from '@faker-js/faker';
const AWS = require("aws-sdk");

exports.handler = async (event: { batchSize: any; }) => {
  const batchSize = event.batchSize;
  let persons: any[] = [];
  const tableName = process.env.TABLE_NAME;
  const docClient = new AWS.DynamoDB.DocumentClient();

  for (let step = 0; step < batchSize; step++) {
    const person = {
      lastname: faker.name.lastName(),
      firstname: faker.name.firstName(),
      gender: faker.name.gender(),
      jobDescriptor: faker.name.jobDescriptor(),
      jobArea: faker.name.jobArea(),
      jobType: faker.name.jobType(),
    };

    const params = {
      TableName: tableName,
      Item: {
        pk: String(Math.random()),
        person: person,
      },
    };

    await docClient
      .put(params, function (err: any, data: any) {
        if (err) {
          const response = {
            statusCode: 400,
            body: err,
          };
          return response;
        } else {
          console.log("Added item:", JSON.stringify(data, null, 2));
        }
      })
      .promise();

    persons = [...persons, person];
  }

  const response = {
    statusCode: 200,
    body: persons,
  };
  return response;  
}
