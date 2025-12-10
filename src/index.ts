import { BlobServiceClient } from '@azure/storage-blob';

import './lib/setup';

import { container, LogLevel, SapphireClient } from '@sapphire/framework';
import { Appwrite } from '#lib/services/appwrite.service';
import { GatewayIntentBits } from 'discord.js';
import appwriteConfig from '../appwrite.config.json';

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

const main = async () => {
	try {
		const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING!);

		container.appwrite = new Appwrite({
			endPoint: appwriteConfig.endpoint,
			projectId: appwriteConfig.projectId,
			apiKey: process.env.APPWRITE_API_KEY!,
			bucketId: appwriteConfig.buckets[0].$id,
			databaseId: appwriteConfig.tablesDB[0].$id,
			azureBlobContainerClient: blobServiceClient.getContainerClient('cams')
		});

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
		appwrite: Appwrite;
	}
}

void main();
