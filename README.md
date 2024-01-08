# examples-aws-dynamodb-analytics-cdk

## scenarios

## ddb-kinesis-athena: DynamoDb -> Kinesis Data Streams -> Data Firehose -> S3 -> Glue Crawler -> Athena

![ddb-kinesis-athena architecture](./diagrams/ddb-kinesis-athena.drawio.svg)

## archive

![overview](./diagrams/overview.drawio.svg)

## deploy options

The [config file](./cdk/bin/config.ts) controls the deplyoement options.

### Firehose

The formats `JSON` and `Parquet` can be choosen

```typescript
export const config: Config = {
    ...
    kinesisFormat: 'JSON',
    ...
}
```

```typescript
export const config: Config = {
    ...
    kinesisFormat: 'PARQUET',
    ...
}
```


### Quicksight

```typescript
export const config: Config = {
    ...
    isQuicksight: true,
    ...
}
```

`cd cdk`

`QUICKSIGHT_USERNAME=<<Quicksight user name>> npx cdk deploy`

## desription

see more information here: [https://dev.to/aws-builders/example-how-to-analyze-dynamodb-item-changes-with-kinesis-and-athena-created-with-cdk-1o6p](https://dev.to/aws-builders/example-how-to-analyze-dynamodb-item-changes-with-kinesis-and-athena-created-with-cdk-1o6p)

## warnings

:warning: Don't forget to destroy after testing. 

* Kinesis Data Streams has [costs](https://aws.amazon.com/kinesis/data-streams/pricing/) per hour
* Quicksight has [costs](https://aws.amazon.com/quicksight/pricing/) after the free trial
