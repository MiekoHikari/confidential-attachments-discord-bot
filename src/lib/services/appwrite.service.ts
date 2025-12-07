import { UserError } from '@sapphire/framework';
import { ErrorCodes, generateFailure } from './errors.service';
import { Client } from 'node-appwrite';

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
