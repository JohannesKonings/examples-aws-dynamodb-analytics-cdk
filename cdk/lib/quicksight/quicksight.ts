import { Construct } from 'constructs'
import { aws_s3_deployment as s3Deployment } from 'aws-cdk-lib'
import { IBucket } from 'aws-cdk-lib/aws-s3'

// https://aws-blog.de/2021/09/building-quicksight-datasets-with-cdk-s3.html

export interface QuicksightProps {
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
  }
}
