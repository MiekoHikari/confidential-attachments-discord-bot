import { watermarkQueue } from '#lib/mq';
import { Route } from '@sapphire/plugin-api';

export class UserRoute extends Route {
	public async run(_request: Route.Request, response: Route.Response) {
		const waitingCount = await watermarkQueue.getWaitingCount();
		const activeCount = await watermarkQueue.getActiveCount();

		return response.ok({
			waitingCount,
			activeCount,
			total: waitingCount + activeCount
		}); // Return total jobs in queue
	}
}
