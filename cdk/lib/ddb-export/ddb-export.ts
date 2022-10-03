import { Construct } from 'constructs'
import { aws_iam as iam, aws_s3 as s3, aws_lambda_nodejs as lambdaNodejs, Duration, aws_dynamodb as dynamodb, aws_athena as athena, Stack } from 'aws-cdk-lib'
import * as glueAlpha from '@aws-cdk/aws-glue-alpha'
import { readFileSync } from 'fs'
import { join } from 'path'

export interface DdbExportProps {
  name: string
  table: dynamodb.ITable
  firehoseBucket: s3.IBucket
  athenaResultBucket: s3.IBucket
  glueDb: glueAlpha.IDatabase
  athenaWorkgroup: athena.CfnWorkGroup
}

export class DdbExport extends Construct {
  constructor(scope: Construct, id: string, props: DdbExportProps) {
    super(scope, id)

    const getSqlString = (file: string): string => {
      let createTableCommand = readFileSync(join(__dirname, `${file}`), 'utf-8').toString()
      const s3Location = `s3://${props.firehoseBucket.bucketName}/ddb-exports/AWSDynamoDB/ddb-export-id/data/`
      createTableCommand = createTableCommand.replace(/s3Location/g, s3Location)
      return createTableCommand
    }

    const queryStringCreateTable = getSqlString('createTable.sql')
    const queryStringReadTable = getSqlString('readTable.sql')

    const ddbExportAthenaQuery = new lambdaNodejs.NodejsFunction(this, 'lambda-function-ddb-export', {
      functionName: `${props.name}-ddb-export-athena-query`,
      timeout: Duration.minutes(2),
      environment: {
        REGION: Stack.of(this).region,
        DYNAMO_DB_TABLE_ARN: props.table.tableArn,
        S3_BUCKET_NAME: props.firehoseBucket.bucketName,
        GLUE_DATABASE_NAME: props.glueDb.databaseName,
        ATHENA_WORKGROUP_NAME: props.athenaWorkgroup.name,
        ATHENA_QUERY_STRING_CREATE_TABLE: queryStringCreateTable,
        ATHENA_QUERY_STRING_READ_TABLE: queryStringReadTable,
      },
    })
    ddbExportAthenaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:ExportTableToPointInTime'],
        resources: [props.table.tableArn],
      })
    )
    ddbExportAthenaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject'],
        resources: [props.firehoseBucket.bucketArn, `${props.firehoseBucket.bucketArn}/*`,
        props.athenaResultBucket.bucketArn, `${props.athenaResultBucket.bucketArn}/*`],
      })
    );
    ddbExportAthenaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: [props.firehoseBucket.encryptionKey!.keyArn, props.athenaResultBucket.encryptionKey!.keyArn],
      })
    )
    ddbExportAthenaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['athena:CreateNamedQuery', 'athena:ListNamedQueries', 'athena:GetNamedQuery', 'athena:UpdateNamedQuery', 'athena:StartQueryExecution'],
        resources: [`arn:aws:athena:${Stack.of(this).region}:${Stack.of(this).account}:workgroup/${props.athenaWorkgroup.name}`],
      })
    );
    ddbExportAthenaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
        'glue:BatchCreatePartition',
        'glue:BatchDeletePartition',
        'glue:BatchDeleteTable',
        'glue:BatchGetPartition',
        'glue:CreateDatabase',
        'glue:CreatePartition',
        'glue:CreateTable',
        'glue:DeleteDatabase',
        'glue:DeletePartition',
        'glue:DeleteTable',
        'glue:GetDatabase',
        'glue:GetDatabases',
        'glue:GetPartition',
        'glue:GetPartitions',
        'glue:GetTable',
        'glue:GetTables',
        'glue:UpdateDatabase',
        'glue:UpdatePartition',
        'glue:UpdateTable'
      ],
        resources: [
          `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:catalog`, 
          props.glueDb.databaseArn, 
          `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:table/${props.glueDb.databaseName}/*`],
      })
    );
  }
}
