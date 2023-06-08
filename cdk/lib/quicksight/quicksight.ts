import { Construct } from 'constructs'
import { Stack, aws_s3_deployment as s3Deployment, aws_quicksight as quicksightCfn, custom_resources } from 'aws-cdk-lib'
import { IBucket } from 'aws-cdk-lib/aws-s3'

export interface QuicksightProps {
  name: string
  bucket: IBucket
  prefix: string
  quicksightUsername: string
}

export class Quicksight extends Construct {
  constructor(scope: Construct, id: string, props: QuicksightProps) {
    super(scope, id)

    const manifest = {
      fileLocations: [
        {
          URIPrefixes: [`s3://${props.bucket.bucketName}/${props.prefix}/`],
        },
      ],
      globalUploadSettings: {
        format: 'JSON',
      },
    }

    const s3BucketDeployment = new s3Deployment.BucketDeployment(this, 'deploy-manifest', {
      sources: [s3Deployment.Source.jsonData('manifest.json', manifest)],
      destinationBucket: props.bucket,
      destinationKeyPrefix: 'manifest',
    })
    const dummyJsonString = JSON.stringify({ dummy: 'dummy'}); // Delete after deplyoment
    const customResourcePutObject = new custom_resources.AwsCustomResource(this, 'prefix-creation', { // add -put
      onCreate: {
        service: 'S3',
        action: 'putObject',
        parameters: {
          Bucket: props.bucket.bucketName,
          Key: `${props.prefix}/dummy.json`,
          Body: dummyJsonString,
        },
        physicalResourceId: custom_resources.PhysicalResourceId.of('prefix-creation'),
      },
      policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({ resources: custom_resources.AwsCustomResourcePolicy.ANY_RESOURCE }),
    });
    props.bucket.grantReadWrite(customResourcePutObject);

    const datasourceName = `${props.name}-datasource`
    const datasetName = `${props.name}-dataset`
    const manifestKey = 'manifest/manifest.json'

    const principalArn = `arn:aws:quicksight:${Stack.of(this).region}:${Stack.of(this).account}:user/default/${props.quicksightUsername}`

    const permissionsDatasource = [
      {
        principal: principalArn,
        actions: [
          'quicksight:DescribeDataSource',
          'quicksight:DescribeDataSourcePermissions',
          'quicksight:PassDataSource',
          'quicksight:UpdateDataSource',
          'quicksight:DeleteDataSource',
          'quicksight:UpdateDataSourcePermissions',
        ],
      },
    ]

    const permissionsDataset = [
      {
        principal: principalArn,
        actions: [
          'quicksight:DescribeDataSet',
          'quicksight:DescribeDataSetPermissions',
          'quicksight:PassDataSet',
          'quicksight:DescribeIngestion',
          'quicksight:ListIngestions',
          'quicksight:UpdateDataSet',
          'quicksight:DeleteDataSet',
          'quicksight:CreateIngestion',
          'quicksight:CancelIngestion',
          'quicksight:UpdateDataSetPermissions',
        ],
      },
    ]

    const datasource = new quicksightCfn.CfnDataSource(this, 'datasource', {
      name: datasourceName,
      type: 'S3',
      awsAccountId: Stack.of(this).account,
      dataSourceId: datasourceName,
      dataSourceParameters: {
        s3Parameters: {
          manifestFileLocation: {
            bucket: props.bucket.bucketName,
            key: manifestKey,
          },
        },
      },
      permissions: permissionsDatasource,
    })
    datasource.node.addDependency(customResourcePutObject)

    const dataset = new quicksightCfn.CfnDataSet(this, 'dataset', {
      name: datasetName,
      awsAccountId: Stack.of(this).account,
      dataSetId: datasetName,
      importMode: 'SPICE',
      physicalTableMap: {
        itemChanges: {
          s3Source: {
            dataSourceArn: datasource.attrArn,
            uploadSettings: {
              format: 'JSON',
            },
            inputColumns: [
              {
                name: 'awsRegion',
                type: 'STRING',
              },
              {
                name: 'eventID',
                type: 'STRING',
              },
              {
                name: 'eventName',
                type: 'STRING',
              },
              {
                name: 'userIdentity',
                type: 'STRING',
              },
              {
                name: 'recordFormat',
                type: 'STRING',
              },
              {
                name: 'tableName',
                type: 'STRING',
              },
              {
                name: 'dynamodb.ApproximateCreationDateTime',
                type: 'STRING',
              },
              {
                name: 'dynamodb.Keys.pk.S',
                type: 'STRING',
              },
              {
                name: 'dynamodb.NewImage.pk.S',
                type: 'STRING',
              },
              {
                name: 'dynamodb.NewImage.person.M.jobArea.S',
                type: 'STRING',
              },
              {
                name: 'dynamodb.NewImage.person.M.firstname.S',
                type: 'STRING',
              },
              {
                name: 'dynamodb.NewImage.person.M.gender.S',
                type: 'STRING',
              },
              {
                name: 'dynamodb.NewImage.person.M.jobType.S',
                type: 'STRING',
              },
              {
                name: 'dynamodb.NewImage.person.M.jobDescriptor.S',
                type: 'STRING',
              },
              {
                name: 'dynamodb.NewImage.person.M.lastname.S',
                type: 'STRING',
              },
              {
                name: 'dynamodb.SizeBytes',
                type: 'STRING',
              },
              {
                name: 'eventSource',
                type: 'STRING',
              },
            ],
          },
        },
      },
      logicalTableMap: {
        logicalTableProperty: {
          alias: `${datasetName}-alias`,
          source: { physicalTableId: 'itemChanges' },
        },
      },
      permissions: permissionsDataset,
    });

    const customResourceDeleteObject = new custom_resources.AwsCustomResource(this, 'prefix-creation-delete', {
      onCreate: {
        service: 'S3',
        action: 'deleteObject',
        parameters: {
          Bucket: props.bucket.bucketName,
          Key: `${props.prefix}/dummy.json`,
        },
        physicalResourceId: custom_resources.PhysicalResourceId.of('prefix-creation'),
      },
      policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({ resources: custom_resources.AwsCustomResourcePolicy.ANY_RESOURCE }),
    });
    props.bucket.grantReadWrite(customResourceDeleteObject);
    customResourceDeleteObject.node.addDependency(dataset);

  }
}
