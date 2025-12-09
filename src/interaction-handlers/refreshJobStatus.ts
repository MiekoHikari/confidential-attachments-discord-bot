import { refreshButton } from '#lib/services/cams.service';
import { ErrorCodes, generateFailure } from '#lib/services/errors.service';
import { AccessLogs, AccessLogsAccessType, CompletedJobs, Items } from '#lib/types/appwrite';
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes, UserError } from '@sapphire/framework';
import { ActionRowBuilder, AttachmentBuilder, MessageActionRowComponentBuilder, type ButtonInteraction } from 'discord.js';
import { ID, Query } from 'node-appwrite';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, jobId: string) {
		await interaction.deferUpdate();
		const refreshButtonComponent = refreshButton(jobId).setDisabled(true);

		// await interaction.editReply({
		// 	components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(refreshButtonComponent)]
		// });

		const watermarkJobQuery = await this.container.appwriteTablesDb.listRows<CompletedJobs>({
			databaseId: process.env.APPWRITE_DATABASE_ID!,
			tableId: 'completed_jobs',
			queries: [Query.equal('jobId', jobId), Query.select(['uploadItem.*', 'jobId']), Query.limit(1)]
		});

		if (watermarkJobQuery.total !== 0) {
			const watermarkJob = watermarkJobQuery.rows[0];

			const attachment = await this.firstTimeView(interaction, watermarkJob);

			return await interaction.editReply({
				content: `Your file is ready! Here is your confidential attachment:`,
				components: [],
				embeds: [],
				files: [attachment]
			});
		} else {
			refreshButtonComponent.setDisabled(false);

			// 5 second cooldown before allowing another refresh
			await new Promise((resolve) => setTimeout(resolve, 5000));

			return await interaction.editReply({
				content: `Your watermark job is still being processed. Please try again later.`,
				components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(refreshButtonComponent)]
			});
		}
	}

	private async firstTimeView(interaction: ButtonInteraction, completed_jobs: CompletedJobs) {
		const logItem = await this.container.appwriteTablesDb.createRow<AccessLogs>({
			databaseId: process.env.APPWRITE_DATABASE_ID!,
			tableId: 'access_logs',
			rowId: ID.unique(),
			data: {
				item: completed_jobs.uploadItem.$id as unknown as Items,
				viewerId: interaction.user.id,
				guildId: completed_jobs.uploadItem.guildId,
				channelId: completed_jobs.uploadItem.channelId,
				completedJob: completed_jobs.$id as unknown as CompletedJobs,
				accessType: AccessLogsAccessType.FIRST_TIME
			}
		});

		const blobItem = this.container.blobContainerClient.getBlockBlobClient(`processed/${completed_jobs.jobId}`);

		const download = await blobItem.downloadToBuffer();
		if (download.length === 0) {
			throw new UserError(
				generateFailure(ErrorCodes.FileNotFound, { errors: [`Processed file for Job ID ${completed_jobs.jobId} not found.`] })
			);
		}

		const properties = await blobItem.getProperties();

		const attachment = new AttachmentBuilder(download, { name: `${logItem.$id}.${properties.contentType?.split('/').pop()}` });
		return attachment;
	}

	public override parse(interaction: ButtonInteraction) {
		const [command, id, tag] = interaction.customId.split('#');
		if (command !== 'refresh') return this.none();

		return this.some(`${id}#${tag}`);
	}
}
