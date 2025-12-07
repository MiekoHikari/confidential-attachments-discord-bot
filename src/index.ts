import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

import './lib/setup';

import { container, LogLevel, SapphireClient } from '@sapphire/framework';
import { TablesDB, Storage } from 'node-appwrite';
import { createAppwriteClient } from '#lib/services/appwrite.service';
import { GatewayIntentBits } from 'discord.js';
// import { GatewayIntentBits, Partials } from 'discord.js';

const client = new SapphireClient({
	logger: {
		level: LogLevel.Debug
	},
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
	partials: [
		// Build as we code
	],
	api: {
		automaticallyConnect: true,
		listenOptions: {
			port: 4000
		}
	}
});

const appwriteClient = createAppwriteClient();

const main = async () => {
	try {
		container.appwriteTablesDb = new TablesDB(appwriteClient);
		container.appwriteStorageClient = new Storage(appwriteClient);

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
		appwriteTablesDb: TablesDB;
		appwriteStorageClient: Storage;
		blobContainerClient: ContainerClient;
	}
}

void main();
