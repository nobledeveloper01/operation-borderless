import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE = 'response:message';

// Sets the human-readable message the success envelope carries for this route.
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE, message);
