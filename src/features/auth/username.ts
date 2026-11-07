import { containsSecret } from '../../shared/lib/sensitiveData';
import { cleanUsername, isReservedUsername, isValidUsername } from '../../../ai-server/src/deviceRules';

export type UsernameProblem = 'format' | 'reserved' | 'secret';

/** Why this username can't be used, or null if it is fine. The server checks the format again. */
export function usernameProblem(name: string): UsernameProblem | null {
  const clean = cleanUsername(name);
  if (containsSecret(clean)) return 'secret';
  if (isReservedUsername(clean)) return 'reserved';
  return isValidUsername(clean) ? null : 'format';
}
