import { Construct } from 'constructs'
import {
  aws_iam as iam,
  aws_s3 as s3,
  aws_lambda_nodejs as lambdaNodejs,
  Duration,
  aws_dynamodb as dynamodb,
  aws_athena as athena,
  aws_stepfunctions as stepfunctions,
  aws_stepfunctions_tasks as stepfunctions_tasks,
  Stack,
} from 'aws-cdk-lib'
import * as glueAlpha from '@aws-cdk/aws-glue-alpha'
import { readFileSync } from 'fs'
import { join } from 'path'

export interface DdbExportStepFunctionProps {
  name: string
  table: dynamodb.ITable
  bucket: s3.IBucket
  athenaResultBucket: s3.IBucket
  glueDb: glueAlpha.IDatabase
  athenaWorkgroup: athena.CfnWorkGroup
}

export class DdbExportStepFunction extends Construct {
  constructor(scope: Construct, id: string, props: DdbExportStepFunctionProps) {
    super(scope, id)

    const lambdaStartExport = new lambdaNodejs.NodejsFunction(this, 'lambda-function-start-export', {
      functionName: `${props.name}-ddb-start-export`,
      timeout: Duration.minutes(2),
      environment: {
        REGION: Stack.of(this).region,
        DYNAMO_DB_TABLE_ARN: props.table.tableArn,
        S3_BUCKET_NAME: props.bucket.bucketName,
      },
    })
    lambdaStartExport.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:ExportTableToPointInTime'],
        resources: [props.table.tableArn],
      })
    )
    lambdaStartExport.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject'],
        resources: [`${props.bucket.bucketArn}/*`],
      })
    )
    lambdaStartExport.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: [props.bucket.encryptionKey!.keyArn],
      })
    )

    const lambdaCheckExportState = new lambdaNodejs.NodejsFunction(this, 'lambda-function-check-export-state', {
      functionName: `${props.name}-ddb-check-export-state`,
      timeout: Duration.minutes(2),
      environment: {
        REGION: Stack.of(this).region,
        DYNAMO_DB_TABLE_ARN: props.table.tableArn,
        S3_BUCKET_NAME: props.bucket.bucketName,
      },
    })
    lambdaCheckExportState.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:DescribeExport'],
        resources: [`${props.table.tableArn}/export/*`],
      })
    )

    const sfnTaskStartExport = new stepfunctions_tasks.LambdaInvoke(this, 'start export table to S3', {
      lambdaFunction: lambdaStartExport,
      outputPath: '$.Payload',
    })

    const sfnTaskCheckExportState = new stepfunctions_tasks.LambdaInvoke(this, 'check export state', {
      lambdaFunction: lambdaCheckExportState,
      outputPath: '$.Payload',
    })
    sfnTaskCheckExportState.addRetry({
      interval: Duration.seconds(30),
      maxAttempts: 10,
      backoffRate: 2,
      errors: ['InProgressError'],
    })

    const athenaTableName = 'ddb_exported_table'

    const athenaDropTable = new stepfunctions_tasks.AthenaStartQueryExecution(this, 'drop Athena table', {
      queryString: `DROP TABLE IF EXISTS \`${props.glueDb.databaseName}.${athenaTableName}\`;`,
      workGroup: props.athenaWorkgroup.name,
      queryExecutionContext: {
        databaseName: props.glueDb.databaseName,
      },
      integrationPattern: stepfunctions.IntegrationPattern.RUN_JOB,
      resultPath: '$.TaskResult',
    })

    const getSqlString = (file: string): string => {
      let createTableCommand = readFileSync(join(__dirname, `${file}`), 'utf-8').toString()
      const s3Location = `s3://${props.bucket.bucketName}/ddb-exports/AWSDynamoDB/ddb-export-id/data/`
      createTableCommand = createTableCommand.replace(/s3Location/g, s3Location)
      createTableCommand = createTableCommand.replace(/table_name/g, athenaTableName)
      return createTableCommand
    }

    const queryStringCreateTable = getSqlString('createTable.sql')

    // const athenaCreateTable = new stepfunctions_tasks.AthenaStartQueryExecution(this, 'create table', {
    //   queryString: queryStringCreateTable,

    //   workGroup: props.athenaWorkgroup.name,
    //   queryExecutionContext: {
    //     databaseName: props.glueDb.databaseName,
    //   },
    //   resultPath: '$.TaskResult',
    // })

    const lambdaCreateAthenaTable = new lambdaNodejs.NodejsFunction(this, 'lambda-function-create-athena-table', {
      functionName: `${props.name}-create-athena-table`,
      timeout: Duration.minutes(2),
      environment: {
        REGION: Stack.of(this).region,
        GLUE_DATABASE_NAME: props.glueDb.databaseName,
        ATHENA_WORKGROUP_NAME: props.athenaWorkgroup.name,
        ATHENA_QUERY_STRING_CREATE_TABLE: queryStringCreateTable,
      },
    })
    lambdaCreateAthenaTable.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['athena:StartQueryExecution'],
        resources: [`arn:aws:athena:${Stack.of(this).region}:${Stack.of(this).account}:workgroup/${props.athenaWorkgroup.name}`],
      })
    )
    lambdaCreateAthenaTable.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:*'],
        resources: [`*`],
        // actions: ['s3:PutObject'],
        // resources: [`${props.bucket.bucketArn}/*`],
      })
    );
    lambdaCreateAthenaTable.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:*'],
        resources: ['*'],
        // actions: ['kms:Decrypt'],
        // resources: [props.bucket.encryptionKey!.keyArn],
      })
    );
    lambdaCreateAthenaTable.addToRolePolicy(
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
          `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:catalog`, // remove?
          `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:database/default`, // remove?
          props.glueDb.databaseArn, 
          `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:table/${props.glueDb.databaseName}/${athenaTableName}`],
      })
    );

    const sfnTaskCreateAthenaTable = new stepfunctions_tasks.LambdaInvoke(this, 'create Athena table', {
      lambdaFunction: lambdaCreateAthenaTable,
    })

    const queryStringReadTable = getSqlString('readTable.sql')

    const lambdaCreateAthenaQuery = new lambdaNodejs.NodejsFunction(this, 'lambda-function-create-athena-query', {
      functionName: `${props.name}-create-athena-query`,
      timeout: Duration.minutes(2),
      environment: {
        REGION: Stack.of(this).region,
        ATHENA_WORKGROUP_NAME: props.athenaWorkgroup.name,
        ATHENA_TABLE_NAME: athenaTableName,
        GLUE_DATABASE_NAME: props.glueDb.databaseName,
        ATHENA_QUERY_STRING_READ_TABLE: queryStringReadTable,
      },
    })
    lambdaCreateAthenaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['athena:CreateNamedQuery', 'athena:ListNamedQueries', 'athena:GetNamedQuery', 'athena:UpdateNamedQuery'],
        resources: [`arn:aws:athena:${Stack.of(this).region}:${Stack.of(this).account}:workgroup/${props.athenaWorkgroup.name}`],
      })
    )
    lambdaCreateAthenaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: [props.athenaResultBucket.encryptionKey!.keyArn],
      })
    )

    const sfnTaskCreateAthenaQuery = new stepfunctions_tasks.LambdaInvoke(this, 'create Athena query', {
      lambdaFunction: lambdaCreateAthenaQuery,
    })

    const definition = sfnTaskStartExport.next(sfnTaskCheckExportState).next(athenaDropTable).next(sfnTaskCreateAthenaTable).next(sfnTaskCreateAthenaQuery)

    const sfn = new stepfunctions.StateMachine(this, 'ddb-export-state-machine', {
      stateMachineName: `${props.name}-ddb-export-state-machine`,
      definition,
    })
    // https://aws.amazon.com/de/premiumsupport/knowledge-center/access-denied-athena/
    sfn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:*'],
        resources: [props.athenaResultBucket.bucketArn, `${props.athenaResultBucket.bucketArn}/*`],
      })
    )
    sfn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: [props.athenaResultBucket.encryptionKey!.keyArn],
      })
    )
    // sfn.addToRolePolicy(
    //   new iam.PolicyStatement({
    //     actions: [
    //     'glue:BatchCreatePartition',
    //     'glue:BatchDeletePartition',
    //     'glue:BatchDeleteTable',
    //     'glue:BatchGetPartition',
    //     'glue:CreateDatabase',
    //     'glue:CreatePartition',
    //     'glue:CreateTable',
    //     'glue:DeleteDatabase',
    //     'glue:DeletePartition',
    //     'glue:DeleteTable',
    //     'glue:GetDatabase',
    //     'glue:GetDatabases',
    //     'glue:GetPartition',
    //     'glue:GetPartitions',
    //     'glue:GetTable',
    //     'glue:GetTables',
    //     'glue:UpdateDatabase',
    //     'glue:UpdatePartition',
    //     'glue:UpdateTable'
    //   ],
    //     resources: [props.glueDb.databaseArn, `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:table/${props.glueDb.databaseName}/${athenaTableName}`],
    //   })
    // )
  }
}
