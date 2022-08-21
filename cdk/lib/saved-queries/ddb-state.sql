SELECT dynamodb.newimage.pk.s AS pk,
        dynamodb.newimage.person.M.firstname.s AS firstname,
        dynamodb.newimage.person.M.lastname.s AS lastname,
        dynamodb.approximatecreationdatetime AS ts,
        dynamodb.newimage,
        *
FROM "athenaDbName"."athenaTableName" AS persons1
WHERE (eventname = 'INSERT'
        OR eventname = 'MODIFY')
        AND dynamodb.approximatecreationdatetime =
    (SELECT MAX(dynamodb.approximatecreationdatetime)
    FROM "athenaDbName"."athenaTableName" AS persons2
    WHERE persons2.dynamodb.newimage.pk.s = persons1.dynamodb.newimage.pk.s);