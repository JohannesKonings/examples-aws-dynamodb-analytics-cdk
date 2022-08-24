import { Construct } from 'constructs'
import { aws_iam as iam, aws_s3 as s3 } from 'aws-cdk-lib'

export interface QuicksightRoleProps {
  name: string
  bucket: s3.IBucket
}

export class QuicksightRole extends Construct {
  constructor(scope: Construct, id: string, props: QuicksightRoleProps) {
    super(scope, id)

    const quicksightRoleName = 'aws-quicksight-service-role-v0'

    const quicksightRole = iam.Role.fromRoleName(this, 'quicksight-role', quicksightRoleName)

    quicksightRole.attachInlinePolicy(
      new iam.Policy(this, `${props.name}-policy`, {
        statements: [
          new iam.PolicyStatement({
            actions: ['kms:Decrypt', 's3:GetObject', 's3:List*'],
            resources: [props.bucket.bucketArn, `${props.bucket.bucketArn}/*`, props.bucket.encryptionKey!.keyArn],
          }),
        ],
      })
    )
  }
}
