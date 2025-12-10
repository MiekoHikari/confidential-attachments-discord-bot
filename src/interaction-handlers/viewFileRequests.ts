import { refreshButtonRow } from '#lib/services/cams.service';
import { ErrorCodes, generateFailure } from '#lib/services/errors.service';
import { AccessLogsAccessType } from '#lib/types/appwrite';
import { hasDaysPassed } from '#lib/utils';
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes, UserError } from '@sapphire/framework';
import { AttachmentBuilder, EmbedBuilder, type ButtonInteraction } from 'discord.js';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, rowId: string) {
		await interaction.deferReply({ ephemeral: true });

		const item = await this.container.appwrite.getMediaItemById(rowId);
		if (!item) throw new UserError(generateFailure(ErrorCodes.FileNotFound, { errors: [`Item with ID ${rowId} not found.`] }));

		const File = await this.container.appwrite.getStorageFile(item.storageFileId);
		if (!File)
			throw new UserError(generateFailure(ErrorCodes.FileNotFound, { errors: [`Storage file with ID ${item.storageFileId} not found.`] }));

		const accessLogs = await this.container.appwrite.listViewerAccessLogs(interaction.user.id, item.$id);

		if (accessLogs.length === 0) {
			const jobId = await this.container.appwrite.createWatermarkJob(interaction.user.id, File.file, File.metadata, item.$id);
			return this.jobCreationMessage(interaction, jobId);
		}

		const latestRecord = accessLogs.reduce((prev, current) => (prev.$createdAt > current.$createdAt ? prev : current));

		if (hasDaysPassed(latestRecord.$createdAt, 7)) {
			await this.container.appwrite.createWatermarkJob(interaction.user.id, File.file, File.metadata, item.$id);
		}

		const log = await this.container.appwrite.createAccessLogEntry(
			interaction.user.id,
			item,
			latestRecord.completedJob.$id,
			AccessLogsAccessType.REPEAT_VIEW
		);

		const processedFile = await this.container.appwrite.getProcessedJob(log.completedJob.jobId);
		if (!processedFile)
			throw new UserError(
				generateFailure(ErrorCodes.FileNotFound, { errors: [`Processed file for job ID ${log.completedJob.jobId} not found.`] })
			);

		const attachment = new AttachmentBuilder(processedFile.buffer, {
			name: `${log.$id}.${processedFile.contentType.split('/').pop()}`
		});

		return await interaction.editReply({
			content: `You have already accessed this file. Here is your access!`,
			files: [attachment]
		});
	}

	private async jobCreationMessage(interaction: ButtonInteraction, jobId: string) {
		const embed = new EmbedBuilder()
			.setDescription(
				`### Your file is being processed! ⌛\
			\nRefresh this message using the button below in a few moments to check if your file is ready.`
			)
			.setColor('Yellow')
			.setThumbnail('https://cdn3.emoji.gg/emojis/31274-waiting-ids.png')
			.setTimestamp();

		const refreshButtonRowComponent = refreshButtonRow(jobId);

		return await interaction.editReply({ embeds: [embed], components: [refreshButtonRowComponent] });
	}

	public override parse(interaction: ButtonInteraction) {
		const [command, rowId] = interaction.customId.split('#');
		if (command !== 'viewFile') return this.none();

		return this.some(rowId);
	}
}
