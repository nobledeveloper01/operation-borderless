import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

// Numbers without a country code are read as Nigerian, the sandbox's home market.
export const DEFAULT_PHONE_REGION = 'NG';

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Returns the number in E.164 form, or undefined when it isn't a real mobile or fixed number.
export function normalisePhone(phone: string): string | undefined {
  const parsed = parsePhoneNumberFromString(phone.trim(), DEFAULT_PHONE_REGION);
  return parsed?.isValid() ? parsed.number : undefined;
}
