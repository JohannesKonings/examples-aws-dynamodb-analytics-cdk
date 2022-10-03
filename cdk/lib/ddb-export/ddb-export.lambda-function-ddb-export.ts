import { DynamoDBClient, ExportTableToPointInTimeCommand } from '@aws-sdk/client-dynamodb'
import {
  AthenaClient,
  UpdateNamedQueryCommand,
  CreateNamedQueryCommand,
  GetNamedQueryCommand,
  ListNamedQueriesCommand,
  StartQueryExecutionCommand,
} from '@aws-sdk/client-athena'

const region = process.env.REGION
const dynamoDbTableArn = process.env.DYNAMO_DB_TABLE_ARN
const s3BucketName = process.env.S3_BUCKET_NAME
const glueDatabaseName = process.env.GLUE_DATABASE_NAME
const athenaWorkgroupName = process.env.ATHENA_WORKGROUP_NAME
const athenaQueryStringCreateTable = process.env.ATHENA_QUERY_STRING_CREATE_TABLE
const athenaQueryStringReadTable = process.env.ATHENA_QUERY_STRING_READ_TABLE

const athenaTableName = 'ddb_exported_table'

exports.handler = async () => {
  const exportId = await exportDynamoDbTable()
  await dropAthenaTable()
  await createOrUpdateAthenaSavedQuery('ddb-export-create-table', athenaQueryStringCreateTable!, exportId!)
  await createOrUpdateAthenaSavedQuery('ddb-export-read-table', athenaQueryStringReadTable!)

  const response = {
    statusCode: 200,
    body: {},
  }
  return response
}

const exportDynamoDbTable = async () => {
  const client = new DynamoDBClient({ region: region })

  const command = new ExportTableToPointInTimeCommand({
    TableArn: dynamoDbTableArn,
    S3Bucket: s3BucketName,
    S3Prefix: 'ddb-exports',
  })

  const response = await client.send(command)
  console.log('responseDynamoDBClient', response)
  const exportArn = response.ExportDescription!.ExportArn
  console.log('exportArn', exportArn)
  const exportId = exportArn!.split('/').pop()
  console.log('exportId', exportId)
  return exportId
}

const createOrUpdateAthenaSavedQuery = async (queryName: string, queryString: string, exportId?: string) => {
  
  const client = new AthenaClient({ region: region })

  const commandListNamedQueriesCommand = new ListNamedQueriesCommand({
    WorkGroup: athenaWorkgroupName,
  })

  const responseListNamedQueriesCommand = await client.send(commandListNamedQueriesCommand)
  console.log('responseListNamedQueriesCommand', responseListNamedQueriesCommand)
  let queryId = ''
  for (const namedQueryId of responseListNamedQueriesCommand.NamedQueryIds!) {
    const commandGetNamedQueryCommand = new GetNamedQueryCommand({
      NamedQueryId: namedQueryId,
    })
    const responseGetNamedQueryCommand = await client.send(commandGetNamedQueryCommand)
    console.log('responseGetNamedQueryCommand', responseGetNamedQueryCommand)
    if (responseGetNamedQueryCommand.NamedQuery!.Name === queryName) {
      queryId = namedQueryId
      break
    }
  }

  let updatedQueryString = queryString!.replace('table_name', athenaTableName)
  updatedQueryString = updatedQueryString!.replace('db_name', glueDatabaseName!)
  if (exportId) {
    updatedQueryString = updatedQueryString!.replace('ddb-export-id', exportId)
  }
  

  console.log('updatedQueryString', updatedQueryString)

  if (queryId === '') {
    const commandCreateNamedQueryCommand = new CreateNamedQueryCommand({
      Name: queryName,
      Database: glueDatabaseName,
      Description: 'DynamoDB Export Query',
      QueryString: updatedQueryString,
      WorkGroup: athenaWorkgroupName,
    })
    const responseCreateNamedQueryCommand = await client.send(commandCreateNamedQueryCommand)
    console.log('responseCreateNamedQueryCommand', responseCreateNamedQueryCommand)
    queryId = responseCreateNamedQueryCommand.NamedQueryId!
  } else {
    const commandUpdateNamedQueryCommand = new UpdateNamedQueryCommand({
      NamedQueryId: queryId,
      QueryString: updatedQueryString,
      Name: queryName,
    })
    const responseUpdateNamedQueryCommand = await client.send(commandUpdateNamedQueryCommand)
    console.log('responseUpdateNamedQueryCommand', responseUpdateNamedQueryCommand)
  }
}

const dropAthenaTable = async () => {
  const client = new AthenaClient({ region: region })

  const commandStartQueryExecutionCommand = new StartQueryExecutionCommand({
    QueryString: `DROP TABLE IF EXISTS \`${glueDatabaseName}.${athenaTableName}\`;`,
    WorkGroup: athenaWorkgroupName,
  })

  const responseStartQueryExecutionCommand = await client.send(commandStartQueryExecutionCommand)
  console.log('responseStartQueryExecutionCommand', responseStartQueryExecutionCommand)
}
