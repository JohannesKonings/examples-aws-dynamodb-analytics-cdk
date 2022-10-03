import {
  AthenaClient, 
  CreateNamedQueryCommand, 
  GetNamedQueryCommand, 
  ListNamedQueriesCommand,
  UpdateNamedQueryCommand,
} from '@aws-sdk/client-athena'

const region = process.env.REGION
const athenaWorkgroupName = process.env.ATHENA_WORKGROUP_NAME
const athenaTableName = process.env.ATHENA_TABLE_NAME
const glueDatabaseName = process.env.GLUE_DATABASE_NAME
const athenaQueryStringReadTable = process.env.ATHENA_QUERY_STRING_READ_TABLE

exports.handler = async () => {

  await createOrUpdateAthenaSavedQuery('sfn-ddb-export-read-table', athenaQueryStringReadTable!)

}

const createOrUpdateAthenaSavedQuery = async (queryName: string, queryString: string) => {
  
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

  let updatedQueryString = queryString!.replace('table_name', athenaTableName!)
  updatedQueryString = updatedQueryString!.replace('db_name', glueDatabaseName!)
  

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
