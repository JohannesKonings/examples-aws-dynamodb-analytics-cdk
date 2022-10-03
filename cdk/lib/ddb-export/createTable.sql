CREATE EXTERNAL TABLE table_name (
 Item struct<pk:struct<S:string>,
             person:struct<M:struct<
                jobArea:struct<S:string>,
                firstname:struct<S:string>,
                gender:struct<S:string>,
                jobType:struct<S:string>,
                jobDescriptor:struct<S:string>,
                lastname:struct<S:string>
                >>>
)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3Location'
TBLPROPERTIES ( 'has_encrypted_data'='true');