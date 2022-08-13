import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import { App } from 'aws-cdk-lib';
import * as Cdk from '../lib/cdk-stack';

test('Empty Stack', () => {
    const app = new App();
    // WHEN
    const stack = new Cdk.CdkStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
