SELECT 
item.pk.S as pk,
item.person.M.firstname.S as firstname,
item.person.M.lastname.S as lastname,
item.person.M.jobArea.S as jobArea,
item.person.M.gender.S as gender, 
item.person.M.jobType.S as jobType, 
item.person.M.jobDescriptor.S as jobDescriptor
FROM "db_name"."table_name";