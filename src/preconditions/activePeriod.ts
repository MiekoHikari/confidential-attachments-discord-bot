// Check if the command is being run during an active period
import { ErrorCodes, generateFailure } from '#lib/errorHandler';
import { Precondition } from '@sapphire/framework';

const BETA_ACTIVE = true;

export class UserPrecondition extends Precondition {
	public override chatInputRun() {
		return BETA_ACTIVE ? this.ok() : this.error(generateFailure(ErrorCodes.PeriodNotStarted));
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		activePeriod: never;
	}
}
