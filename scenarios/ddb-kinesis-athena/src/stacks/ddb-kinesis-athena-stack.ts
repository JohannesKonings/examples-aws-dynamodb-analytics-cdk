import { join } from "node:path";

import { LogLevel } from "@aws-lambda-powertools/logger/lib/types/Log.js";
import { AthenaWorkgroupConstruct } from "@common/src/constructs/athenaWorkgroup.js";
import { DynamoDbTableConstruct } from "@common/src/constructs/dynamoDbTable.js";
import { FirehoseConstruct } from "@common/src/constructs/firehose.js";
import { GlueCrawlerConstruct } from "@common/src/constructs/glueCrawler.js";
import { GlueDatabaseConstruct } from "@common/src/constructs/glueDatabase.js";
import { GlueSecurityConfigurationConstruct } from "@common/src/constructs/glueSecurityConfiguration.js";
import { KinesisStreamConstruct } from "@common/src/constructs/kinesisStream.js";
import { KmsKeyConstruct } from "@common/src/constructs/kmsKey.js";
import { LambdaConstruct } from "@common/src/constructs/lambda.js";
import { S3BucketConstruct } from "@common/src/constructs/s3Bucket.js";
import { __dirname } from "@common/src/types/general.js";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface DdbKinesisAthenaStackProps extends StackProps {
  logLevel: LogLevel;
  scenarioName: string;
}

export class DdbKinesisAthenaStack extends Stack {
  constructor(scope: Construct, id: string, props: DdbKinesisAthenaStackProps) {
    super(scope, id, props);

    const { scenarioName, logLevel } = props;

    const kmsKeyConstruct = new KmsKeyConstruct(this, "KmsKey", {
      scenarioName: scenarioName,
    });

    const kinesisStream = new KinesisStreamConstruct(this, "PersonStream", {
      kmsKey: kmsKeyConstruct.kmsKey,
    });

    const dynamoDbTable = new DynamoDbTableConstruct(this, "PersonTable", {
      kmsKey: kmsKeyConstruct.kmsKey,
      kinesisStream: kinesisStream.stream,
    });

    const lambdaLoader = new LambdaConstruct(this, "LoaderLambda", {
      entry: join(__dirname, `../../../common/src/lambdas/loader.ts`),
      environment: {
        SCENARIO: scenarioName,
        TABLE_NAME: dynamoDbTable.table.tableName,
        LOG_LEVEL: logLevel,
      },
    });
    dynamoDbTable.table.grantWriteData(lambdaLoader.lambda);

    const s3BucketAnlayticsData = new S3BucketConstruct(this, "PersonBucket", {
      kmsKey: kmsKeyConstruct.kmsKey,
    });
    const firehoseDeliveryStream = new FirehoseConstruct(
      this,
      "PersonFirehose",
      {
        s3Bucket: s3BucketAnlayticsData.bucket,
        kinesisStream: kinesisStream.stream,
      }
    );

    const glueDatabase = new GlueDatabaseConstruct(this, "PersonGlueDatabase");

    const glueSecurityConfiguration = new GlueSecurityConfigurationConstruct(
      this,
      "PersonGlueSecurityConfiguration",
      {
        kmsKey: kmsKeyConstruct.kmsKey,
      }
    );

    new GlueCrawlerConstruct(this, "PersonGlueCrawler", {
      s3Bucket: s3BucketAnlayticsData.bucket,
      glueDatabase: glueDatabase.glueDatabase,
      s3BucketPrefix: firehoseDeliveryStream.dataOutputPrefix,
      glueSecurityConfiguration:
        glueSecurityConfiguration.glueSecurityConfiguration,
    });

    new AthenaWorkgroupConstruct(this, `${id}-PersonAthenaWorkgroup`, {
      kmsKey: kmsKeyConstruct.kmsKey,
      s3Bucket: s3BucketAnlayticsData.bucket,
    });
  }
}
