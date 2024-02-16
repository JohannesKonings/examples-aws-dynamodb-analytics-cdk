import { IDatabase, ISecurityConfiguration } from "@aws-cdk/aws-glue-alpha";
import { Stack } from "aws-cdk-lib";
import { CfnCrawler } from "aws-cdk-lib/aws-glue";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { NagSuppressions } from "cdk-nag";
import { kms } from "cdk-nag/lib/rules/index.js";
import { Construct } from "constructs";
import { KmsKeyConstruct } from "./kmsKey.js";

interface GlueCrawlerConstructProps {
  glueDatabase: IDatabase;
  glueSecurityConfiguration: ISecurityConfiguration;
  s3Bucket: IBucket;
  s3BucketPrefix: string;
}

export class GlueCrawlerConstruct extends Construct {
  constructor(scope: Construct, id: string, props: GlueCrawlerConstructProps) {
    super(scope, id);

    const {
      glueDatabase,
      s3Bucket,
      s3BucketPrefix,
      glueSecurityConfiguration,
    } = props;
    const { account, region } = Stack.of(this);

    const roleCrawler = new Role(this, "CrawlerRole", {
      assumedBy: new ServicePrincipal("glue.amazonaws.com"),
    });
    roleCrawler.addToPolicy(
      new PolicyStatement({
        actions: ["glue:GetSecurityConfiguration"],
        resources: ["*"],
      })
    );
    const arnLogGroup = `arn:aws:logs:${region}:${account}:log-group:/aws-glue/crawlers-role/${roleCrawler.roleName}-${glueSecurityConfiguration.securityConfigurationName}:log-stream*`;
    roleCrawler.addToPolicy(
      new PolicyStatement({
        actions: ["logs:CreateLogGroup", "logs:PutLogEvents"],
        resources: [arnLogGroup],
      })
    );
    roleCrawler.addToPolicy(
      new PolicyStatement({
        actions: ["logs:*"],
        resources: ["*"],
      })
    );
    const glueTableArn = `arn:aws:glue:${region}:${account}:table/${glueDatabase.databaseName}/*`;
    roleCrawler.addToPolicy(
      new PolicyStatement({
        actions: [
          "glue:GetDatabase",
          "glue:GetTable",
          "glue:UpdateTable",
          "glue:CreateTable",
          "glue:BatchGetPartition",
          "glue:BatchCreatePartition",
        ],
        resources: [
          glueDatabase.catalogArn,
          glueDatabase.databaseArn,
          glueTableArn,
        ],
      })
    );
    // https://curiousorbit.com/blog/kms-key-does-not-exist/
    // https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html
    // roleCrawler.addToPolicy(
    //   new PolicyStatement({
    //     principals: [new ServicePrincipal("logs.amazonaws.com")],
    //     actions: [
    //       "kms:Encrypt*",
    //       "kms:Decrypt*",
    //       "kms:ReEncrypt*",
    //       "kms:GenerateDataKey*",
    //       "kms:Describe*",
    //     ],
    //     resources: ["*"],
    //     conditions: {
    //       StringEquals: {
    //         "kms:EncryptionContext:aws:logs:arn": arnLogGroup,
    //       },
    //     },
    //   })
    // );
    s3Bucket.encryptionKey?.grantDecrypt(roleCrawler);
    s3Bucket.grantRead(roleCrawler);
    NagSuppressions.addResourceSuppressions(
      roleCrawler,
      [
        {
          id: "AwsSolutions-IAM5",
          reason: "works only with wildcard",
        },
      ],
      true
    );

    const crawler = new CfnCrawler(this, "crawler", {
      // name: `${name}-crawler`,
      role: roleCrawler.roleArn,
      targets: {
        s3Targets: [
          {
            path: `s3://${s3Bucket.bucketName}/${s3BucketPrefix}`,
          },
        ],
      },
      databaseName: glueDatabase.databaseName,
      crawlerSecurityConfiguration:
        glueSecurityConfiguration.securityConfigurationName,
      configuration: JSON.stringify({
        Version: 1.0,
        Grouping: { TableGroupingPolicy: "CombineCompatibleSchemas" },
        CrawlerOutput: {
          Partitions: { AddOrUpdateBehavior: "InheritFromTable" },
        },
      }),
    });
    crawler.node.addDependency(roleCrawler);
  }
}
