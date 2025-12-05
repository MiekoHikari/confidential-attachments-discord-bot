import { Route } from '@sapphire/plugin-api';
import { AttachmentBuilder, InteractionWebhook } from 'discord.js';
import { z } from 'zod';

const bodySchema = z.object({
	jobId: z.string().min(1),
	filename: z.string().min(1),
	interaction: z.object({
		applicationId: z.string(),
		token: z.string(),
		messageId: z.string()
	})
});

export class UserRoute extends Route {
	public async run(request: Route.Request, response: Route.Response) {
		this.container.logger.info('Received CAMS callback request');
		const { jobId, filename, interaction } = await request.readValidatedBodyJson((data) => bodySchema.parse(data));

		if (!this.container.client.isReady()) return response.error(500, 'Client not ready');

		// Check if interaction can still be edited
		try {
			const webhook = new InteractionWebhook(this.container.client, interaction.applicationId, interaction.token);

			const item = this.container.blobContainerClient.getBlockBlobClient(jobId);
			const exists = await item.exists();

			if (!exists) {
				return response.error(404, 'Job ID not found');
			}

			const download = await item.downloadToBuffer();
			if (download.length === 0) {
				return response.error(404, 'Job ID not found');
			}

			const attachment = new AttachmentBuilder(download, { name: filename });
			await item.deleteIfExists();

			await webhook.editMessage(interaction.messageId, {
				content: `Access Code ${jobId} has been generated`,
				files: [attachment]
			});

			return response.ok('Interaction edited successfully');
		} catch (error) {
			this.container.logger.error(`Failed to edit interaction for Job ID ${jobId}: ${(error as Error).message}`);
			return response.error(400, 'Interaction can no longer be edited');
		}
	}
}
