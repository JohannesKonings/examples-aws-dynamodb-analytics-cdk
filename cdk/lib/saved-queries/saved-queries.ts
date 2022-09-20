import { Construct } from 'constructs'
import {
  aws_athena as athenaCfn
} from 'aws-cdk-lib'
import * as glue from '@aws-cdk/aws-glue-alpha'
import { readFileSync } from 'fs';
import { join } from 'path';

export interface SavedQueriesProps {
  glueDb: glue.IDatabase;
  athenaTableName: string;
  athenaWorkgroupName: string;
}

export class SavedQueries extends Construct {
  constructor(scope: Construct, id: string, props: SavedQueriesProps) {
    super(scope, id)

    const getSqlString = (file: string): string => {
      let personDdbStateSqlCommand = readFileSync(join(__dirname, `${file}`), 'utf-8').toString()
      const athenaDbName = props.glueDb.databaseName
      let athenaTableName = props.athenaTableName;
      athenaTableName = athenaTableName.replace(/-/g, '_')
      personDdbStateSqlCommand = personDdbStateSqlCommand.replace(/athenaDbName/g, athenaDbName)
      personDdbStateSqlCommand = personDdbStateSqlCommand.replace(/athenaTableName/g, athenaTableName)
      return personDdbStateSqlCommand
    }

    let queryString = getSqlString('ddb-state.sql')

    // eslint-disable-next-line no-new
    new athenaCfn.CfnNamedQuery(this, 'query-current-ddb-state', {
      database: props.glueDb.databaseName,
      queryString: queryString,
      description: 'query the current state from the ddb person table',
      name: 'current-ddb-state',
      workGroup: props.athenaWorkgroupName
    })

  }
}
