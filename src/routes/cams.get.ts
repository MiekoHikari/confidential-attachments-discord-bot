import { Route } from '@sapphire/plugin-api';

export class UserRoute extends Route {
	public async run(_request: Route.Request, response: Route.Response) {
		return response.ok('Service is running');
	}
}
