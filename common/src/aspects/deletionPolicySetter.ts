import { CfnResource, IAspect, RemovalPolicy } from "aws-cdk-lib";
import { IConstruct } from "constructs";

class DeletionPolicySetter implements IAspect {
  constructor(private readonly policy: RemovalPolicy) {}
  visit(node: IConstruct): void {
    if (node instanceof CfnResource) {
      node.applyRemovalPolicy(this.policy);
    }
  }
}

export { DeletionPolicySetter };
