import {
  AthenaClient,
  StartQueryExecutionCommand,
} from '@aws-sdk/client-athena'

const region = process.env.REGION
const glueDatabaseName = process.env.GLUE_DATABASE_NAME
const athenaWorkgroupName = process.env.ATHENA_WORKGROUP_NAME
const athenaQueryStringCreateTable = process.env.ATHENA_QUERY_STRING_CREATE_TABLE

exports.handler = async (event: any) => {
  const exportId = event.exportId;
  await createAthenaTable(exportId)

}

const createAthenaTable = async (exportId: string) => {
  const client = new AthenaClient({ region: region })

  const updatedAthenaQueryStringCreateTable = athenaQueryStringCreateTable!.replace('ddb-export-id', exportId)

  const commandStartQueryExecutionCommand = new StartQueryExecutionCommand({
    QueryString: updatedAthenaQueryStringCreateTable,
    WorkGroup: athenaWorkgroupName,
    QueryExecutionContext: {
      Database: glueDatabaseName,
    },
  })

  const responseStartQueryExecutionCommand = await client.send(commandStartQueryExecutionCommand)
  console.log('responseStartQueryExecutionCommand', responseStartQueryExecutionCommand)
}
