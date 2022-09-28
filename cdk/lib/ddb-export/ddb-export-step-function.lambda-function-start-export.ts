import { DynamoDBClient, ExportTableToPointInTimeCommand } from '@aws-sdk/client-dynamodb'
import { DdbExportMetaData } from './types'

const region = process.env.REGION
const dynamoDbTableArn = process.env.DYNAMO_DB_TABLE_ARN
const s3BucketName = process.env.S3_BUCKET_NAME

exports.handler = async () => {
  const { exportArn, exportId } = await exportDynamoDbTable()

  const response: DdbExportMetaData = {
    exportArn: exportArn!,
    exportId: exportId!,
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
  return {
    exportArn: exportArn,
    exportId: exportId,
  }
}
