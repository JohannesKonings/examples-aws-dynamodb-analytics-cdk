import { DescribeExportCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DdbExportMetaData } from './types'

const region = process.env.REGION

exports.handler = async (event: DdbExportMetaData) => {
  await checkExportState(event.exportArn)

  const response = event;
  return response
}

const checkExportState = async (exportArn: string) => {
  const client = new DynamoDBClient({ region: region })

  const command = new DescribeExportCommand({
    ExportArn: exportArn,
  })

  const response = await client.send(command)
  console.log('response', response)
  if (response.ExportDescription!.ExportStatus === 'IN_PROGRESS') {
    throw new InProgressError('in progress')
  } else if (response.ExportDescription!.ExportStatus === 'COMPLETED') {
    return
  }
  throw new Error('Not expected export status')
}

class InProgressError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InProgressError';
    this.message = message;
  }
}
