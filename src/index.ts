import './lib/setup';

import { LogLevel, SapphireClient } from '@sapphire/framework';
// import { GatewayIntentBits, Partials } from 'discord.js'; 

const client = new SapphireClient({
	logger: {
		level: LogLevel.Debug
	},
	intents: [
		// Build as we code
	],
	partials: [
		// Build as we code
	],
});

const main = async () => {
	try {
		client.logger.info('Logging in to Discord... 🔑');
		await client.login();
		client.logger.info('Logged in to Discord successfully! ✅');
	} catch (error) {
		client.logger.fatal(error);
		await client.destroy();
		process.exit(1);
	}
};

void main();
