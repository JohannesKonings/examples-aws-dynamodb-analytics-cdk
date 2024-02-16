import { Database, IDatabase } from "@aws-cdk/aws-glue-alpha";
import { Construct } from "constructs";

export class GlueDatabaseConstruct extends Construct {
  readonly glueDatabase: IDatabase;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.glueDatabase = new Database(this, "GlueDatabase");
  }
}
