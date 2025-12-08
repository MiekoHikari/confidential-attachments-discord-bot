import { validImageTypes } from '#lib/constants';
import { getAccessLogByViewerId, getItemById } from '#lib/services/appwrite.service';
import { encodeId } from '#lib/services/crypto.service';
import { ErrorCodes, generateFailure } from '#lib/services/errors.service';
import { newJobSchema, watermarkQueue } from '#lib/services/messageQueue.service';
import { AccessLogs, AccessLogsAccessType, Items } from '#lib/types/appwrite';
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes, UserError } from '@sapphire/framework';
import {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	MessageActionRowComponentBuilder,
	type ButtonInteraction
} from 'discord.js';
import { ID, Models } from 'node-appwrite';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, fileId: string) {
		await interaction.deferReply({ ephemeral: true });

		const item = await getItemById(this.container.appwriteTablesDb, fileId);
		if (!item) throw new UserError(generateFailure(ErrorCodes.FileNotFound, { errors: [`Item with ID ${fileId} not found.`] }));

		const File = await this.getAppwriteFileDetails(item.storageFileId);
		if (!File)
			throw new UserError(generateFailure(ErrorCodes.FileNotFound, { errors: [`Storage file with ID ${item.storageFileId} not found.`] }));

		const { rows: accessLogs } = await getAccessLogByViewerId(this.container.appwriteTablesDb, interaction.user.id, item.$id);

		if (accessLogs.length === 0) {
			return await this.createWatermarkJob(interaction, File.storageFile, File.metadata);
		} else {
			const latestRecord = accessLogs.reduce((prev, current) => (prev.$createdAt > current.$createdAt ? prev : current));

			if (this.hasDaysPassed(latestRecord, 7)) {
				return this.createWatermarkJob(interaction, File.storageFile, File.metadata);
			} else {
				const attachment = await this.repeatView(interaction, item, latestRecord);

				return await interaction.editReply({
					content: `You have already accessed this file. Here is your access!`,
					files: [attachment]
				});
			}
		}
	}

	private async getAppwriteFileDetails(fileId: string) {
		const metadata = await this.container.appwriteStorageClient.getFile({
			bucketId: process.env.APPWRITE_BUCKET_ID!,
			fileId
		});

		if (!metadata) {
			return null;
		}

		const storageFile = await this.container.appwriteStorageClient.getFileDownload({
			bucketId: process.env.APPWRITE_BUCKET_ID!,
			fileId
		});

		return { storageFile, metadata };
	}

	private async createWatermarkJob(interaction: ButtonInteraction, file: ArrayBuffer, metadata: Models.File) {
		const jobId = `${encodeId(interaction.user.id)}#${encodeId(Date.now().toString())}`;

		const blobClient = this.container.blobContainerClient.getBlockBlobClient(jobId);
		await blobClient.uploadData(file);

		const job = newJobSchema.parse({
			container: blobClient.containerName,
			jobId,
			type: validImageTypes.includes(metadata.mimeType) ? 'image' : 'video',
			filename: `${jobId}.${metadata.mimeType.split('/').pop()}`,
			watermarkText: jobId
		});

		return await watermarkQueue
			.add('watermark', job, {
				jobId
			})
			.then(async (job) => {
				await this.jobCreationMessage(interaction, job.data.jobId);
				return job;
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

		const refreshButtonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
			new ButtonBuilder().setLabel('Refresh Status').setCustomId(`refresh#${jobId}`).setStyle(ButtonStyle.Primary).setEmoji('✨')
		);

		return await interaction.editReply({ embeds: [embed], components: [refreshButtonRow] });
	}

	private async repeatView(interaction: ButtonInteraction, item: Items, latestRecord: AccessLogs) {
		const logItem = await this.container.appwriteTablesDb.createRow<AccessLogs>({
			databaseId: process.env.APPWRITE_DATABASE_ID!,
			tableId: 'access_logs',
			rowId: ID.unique(),
			data: {
				itemId: [item.$id] as unknown as Items[],
				viewerId: interaction.user.id,
				guildId: item.guildId,
				channelId: item.channelId,
				jobId: latestRecord.jobId,
				accessType: AccessLogsAccessType.REPEAT_VIEW
			}
		});

		// Get existing file
		const blobItem = this.container.blobContainerClient.getBlockBlobClient(`processed/${latestRecord.jobId}`);
		const exists = await blobItem.exists();

		if (!exists) {
			throw new UserError(generateFailure(ErrorCodes.FileNotFound, { errors: [`Processed file for Job ID ${latestRecord.jobId} not found.`] }));
		}

		const download = await blobItem.downloadToBuffer();
		if (download.length === 0) {
			throw new UserError(generateFailure(ErrorCodes.FileNotFound, { errors: [`Processed file for Job ID ${latestRecord.jobId} not found.`] }));
		}

		const attachment = new AttachmentBuilder(download, { name: `${logItem.$id}.${blobItem.name.split('.').pop()}` });
		return attachment;
	}

	private hasDaysPassed(record: { $createdAt: string }, days: number): boolean {
		const millisecondsInDay = 24 * 60 * 60 * 1000;
		const recordTime = new Date(record.$createdAt).getTime();
		const currentTime = Date.now();
		return currentTime - recordTime > days * millisecondsInDay;
	}

	public override parse(interaction: ButtonInteraction) {
		const [command, id] = interaction.customId.split('#');
		if (command !== 'viewFile') return this.none();

		return this.some(id);
	}
}
