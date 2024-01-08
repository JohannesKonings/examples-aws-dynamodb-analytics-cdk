import {
  FirehoseTransformationEvent,
  FirehoseTransformationEventRecord,
} from "aws-lambda";
export const handler = async (event: FirehoseTransformationEvent) => {
  const output = event.records.map(
    (record: FirehoseTransformationEventRecord) => {
      const entry = Buffer.from(record.data, "base64").toString("utf8");
      const result = entry + "\n";
      const payload = Buffer.from(result, "utf8").toString("base64");
      return {
        recordId: record.recordId,
        result: "Ok",
        data: payload,
      };
    }
  );
  console.log(`Processing completed. Successful records ${output.length}.`);
  return { records: output };
};
