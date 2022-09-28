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
    );
    lambdaStartExport.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject'],
        resources: [`${props.bucket.bucketArn}/*`],
      })
    );
    lambdaStartExport.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: [props.bucket.encryptionKey!.keyArn],
      })
    );

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

    const athenaDropTable = new stepfunctions_tasks.AthenaStartQueryExecution(this, 'drop table', {
      queryString: `DROP TABLE IF EXISTS \`${props.glueDb.databaseName}.ddb_exported_table\`;`,
      workGroup: props.athenaWorkgroup.name,
    });

    const athenaCreateTable = new stepfunctions.Pass(this, 'create table', {});
    const sfnTaskCreateSelectQuery = new stepfunctions.Pass(this, 'create SELECT query', {});

    const definition = sfnTaskStartExport.next(sfnTaskCheckExportState).next(athenaDropTable).next(athenaCreateTable).next(sfnTaskCreateSelectQuery);

    const sfn = new stepfunctions.StateMachine(this, 'ddb-export-state-machine', {
      stateMachineName: `${props.name}-ddb-export-state-machine`,
      definition,
    })
    // https://aws.amazon.com/de/premiumsupport/knowledge-center/access-denied-athena/
    sfn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:*'],
        resources: [props.athenaResultBucket.bucketArn,
                  `${props.athenaResultBucket.bucketArn}/*`],
      })
    );
    sfn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: [props.athenaResultBucket.encryptionKey!.keyArn],
      })
    );
    

  }
}
