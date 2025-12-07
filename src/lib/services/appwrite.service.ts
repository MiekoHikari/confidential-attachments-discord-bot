import { UserError } from '@sapphire/framework';
import { ErrorCodes, generateFailure } from './errors.service';
import { Client, Query, Storage, TablesDB } from 'node-appwrite';

/**
 * This function creates an Appwrite client.
 */
export function createAppwriteClient() {
	if (!process.env.APPWRITE_ENDPOINT || !process.env.APPWRITE_PROJECT_ID || !process.env.APPWRITE_API_KEY) {
		throw new UserError(generateFailure(ErrorCodes.EnvironmentConfigurationError));
	} else {
		const client = new Client();

		return client
			.setEndpoint(process.env.APPWRITE_ENDPOINT) // Your API Endpoint
			.setProject(process.env.APPWRITE_PROJECT_ID) // Your project ID
			.setKey(process.env.APPWRITE_API_KEY); // Your secret API key
	}
}

/**
 * Creates a new storage file
 */
export async function createStorageFile(Storage: Storage, bucketId: string, fileId: string, file: File) {
	return Storage.createFile({
		bucketId: bucketId,
		fileId: fileId,
		file: file
	});
}

/**
 * Convert buffer to File
 */
export function bufferToFile(buffer: Buffer, fileName: string, mimeType: string): File {
	return new File([buffer], fileName, { type: mimeType });
}

export async function duplicateHashExists(Tables: TablesDB, itemHash: string, guildId: string, authorId: string): Promise<boolean> {
	const existingItems = await Tables.listRows({
		databaseId: process.env.APPWRITE_DATABASE_ID!,
		tableId: 'media_items',
		queries: [Query.equal('hash', itemHash), Query.equal('authorId', authorId), Query.equal('guildId', guildId), Query.limit(1)]
	});

	return existingItems.total > 0;
}
