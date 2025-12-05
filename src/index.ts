import { createAppwriteClient } from '#lib/utils';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

import './lib/setup';

import { container, LogLevel, SapphireClient } from '@sapphire/framework';
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
	]
});

const main = async () => {
	try {
		container.appwrite = createAppwriteClient();
		const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING!);
		container.blobContainerClient = blobServiceClient.getContainerClient('cams');

		client.logger.info('Logging in to Discord... 🔑');
		await client.login();
		client.logger.info('Logged in to Discord successfully! ✅');
	} catch (error) {
		client.logger.fatal(error);
		await client.destroy();
		process.exit(1);
	}
};

declare module '@sapphire/framework' {
	interface Container {
		appwrite: ReturnType<typeof createAppwriteClient>;
		blobContainerClient: ContainerClient;
	}
}

void main();
