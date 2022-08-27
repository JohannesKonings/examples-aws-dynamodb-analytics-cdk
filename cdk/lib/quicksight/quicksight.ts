import { Construct } from 'constructs'
import { Stack, aws_s3_deployment as s3Deployment, aws_quicksight as quicksightCfn } from 'aws-cdk-lib'
import { IBucket } from 'aws-cdk-lib/aws-s3'

// https://aws-blog.de/2021/09/building-quicksight-datasets-with-cdk-s3.html

export interface QuicksightProps {
  name: string
  bucket: IBucket
}

export class Quicksight extends Construct {
  constructor(scope: Construct, id: string, props: QuicksightProps) {
    super(scope, id)

    const manifest = {
      fileLocations: [
        {
          URIPrefixes: [`s3://${props.bucket.bucketName}/`],
        },
      ],
      globalUploadSettings: {
        format: 'JSON',
      },
    }

    new s3Deployment.BucketDeployment(this, 'deploy-manifest', {
      sources: [s3Deployment.Source.jsonData('manifest.json', manifest)],
      destinationBucket: props.bucket,
      destinationKeyPrefix: 'manifest',
    })

    const dataSourceName = `${props.name}-data-source`
    const dataSetName = `${props.name}-data-set`
    const manifestKey = 'manifest/manifest.json'

    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-quicksight-datasource-resourcepermission.html
    const quicksightUsername = process.env.QUICKSIGHT_USERNAME
    const principalArn = `arn:aws:quicksight:${Stack.of(this).region}:${Stack.of(this).account}:user/default/${quicksightUsername}`

    const permissionsDataSource = [
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

    const permissionsDataSet = [
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

    const dataSource = new quicksightCfn.CfnDataSource(this, 'data-source', {
      name: dataSourceName,
      type: 'S3',
      awsAccountId: Stack.of(this).account,
      dataSourceId: dataSourceName,
      dataSourceParameters: {
        s3Parameters: {
          manifestFileLocation: {
            bucket: props.bucket.bucketName,
            key: manifestKey,
          },
        },
      },
      permissions: permissionsDataSource,
    })

    const dataSet = new quicksightCfn.CfnDataSet(this, 'data-set', {
      name: dataSetName,
      awsAccountId: Stack.of(this).account,
      dataSetId: dataSetName,
      importMode: 'SPICE',
      physicalTableMap: {
        itemChanges: {
          s3Source: {
            dataSourceArn: dataSource.attrArn,
            uploadSettings: {
              containsHeader: true,
              format: 'JSON',
              startFromRow: 2,
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
          alias: `${dataSetName}-alias`,
          source: { physicalTableId: 'itemChanges' },
        },
      },
      permissions: permissionsDataSet,
    });

    dataSet.
  }
}
