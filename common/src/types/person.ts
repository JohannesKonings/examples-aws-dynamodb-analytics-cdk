import { z } from "zod";

const personSchema = z.object({
  personId: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
});
type Person = z.infer<typeof personSchema>;

export { Person, personSchema };
