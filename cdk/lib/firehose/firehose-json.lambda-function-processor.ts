/* eslint-disable */

import Logger from '@dazn/lambda-powertools-logger'

export const handler = async (event: any, _context: any, callback: Function) => {
  Logger.info('event', event)
  const output = event.records.map((record: any) => {
    const entry = (Buffer.from(record.data, 'base64')).toString('utf8')
    const result = entry + '\n'
    const payload = (Buffer.from(result, 'utf8')).toString('base64')

    return {
      recordId: record.recordId,
      result: 'Ok',
      data: payload
    }
  })
  Logger.info(`Processing completed.  Successful records ${output.length}.`)
  callback(null, { records: output })
}
