// TODO: Interaction Timeout handling for large files
// TODO: Turn Repository into Monorepo for better structure and create an upload container queue
import { maxFileSizeInBytes, validExtensions, validImageTypes, validVideoTypes } from '#lib/constants';
import { bufferToFile, createStorageFile, duplicateHashExists } from '#lib/services/appwrite.service';
import { attachmentAnnounceEmbed } from '#lib/services/cams.service';
import { sha256Hash } from '#lib/services/crypto.service';
import { ErrorCodes, generateFailure } from '#lib/services/errors.service';
import { Items, ItemsType } from '#lib/types/appwrite';
import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ActionRowBuilder, Attachment, ButtonBuilder, ButtonStyle, MessageActionRowComponentBuilder } from 'discord.js';
import { ID } from 'node-appwrite';

@ApplyOptions<Command.Options>({
	description: 'Upload images/videos as confidential attachments',
	preconditions: ['activePeriod']
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder //
				.setName(this.name)
				.setDescription(this.description)
				.addAttachmentOption((option) =>
					option //
						.setName('file1')
						.setDescription('Please upload an image/video file')
						.setRequired(true)
				)
				.addAttachmentOption((option) =>
					option //
						.setName('file2')
						.setDescription('Please upload an image/video file')
						.setRequired(false)
				)
				.addAttachmentOption((option) =>
					option //
						.setName('file3')
						.setDescription('Please upload an image/video file')
						.setRequired(false)
				)
				.addAttachmentOption((option) =>
					option //
						.setName('file4')
						.setDescription('Please upload an image/video file')
						.setRequired(false)
				)
				.addAttachmentOption((option) =>
					option //
						.setName('file5')
						.setDescription('Please upload an image/video file')
						.setRequired(false)
				)
				.addAttachmentOption((option) =>
					option //
						.setName('file6')
						.setDescription('Please upload an image/video file')
						.setRequired(false)
				)
				.addAttachmentOption((option) =>
					option //
						.setName('file7')
						.setDescription('Please upload an image/video file')
						.setRequired(false)
				)
				.addAttachmentOption((option) =>
					option //
						.setName('file8')
						.setDescription('Please upload an image/video file')
						.setRequired(false)
				)
				.addAttachmentOption((option) =>
					option //
						.setName('file9')
						.setDescription('Please upload an image/video file')
						.setRequired(false)
				)
				.addAttachmentOption((option) =>
					option //
						.setName('file10')
						.setDescription('Please upload an image/video file')
						.setRequired(false)
				)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: ['Ephemeral'] });

		try {
			if (!interaction.channel?.isSendable())
				throw new UserError(
					generateFailure(ErrorCodes.UploadFailed, { errors: ['Bot does not have permission to send messages in this channel.'] })
				);

			const attachments = this.extractAttachmentsFromInteraction(interaction);
			const validTypes = [...validImageTypes, ...validVideoTypes];

			const attachmentErrors = this.validateAttachments(attachments, validTypes, maxFileSizeInBytes);

			if (attachmentErrors.length > 0) {
				throw new UserError(generateFailure(ErrorCodes.UploadFailed, { errors: attachmentErrors }));
			}

			const storageItem = await this.createAppwriteStorageItem(interaction, attachments[0]);

			const message = await interaction.editReply({ content: 'File uploaded successfully as a confidential attachment.' });

			const row = await this.createAppwriteItemRow(interaction, storageItem, message.id);

			const actionRow1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				new ButtonBuilder().setLabel(attachments[0].name).setCustomId(`viewFile#${row.$id}`).setStyle(ButtonStyle.Secondary).setEmoji('📁')
			);

			return interaction.channel.send({
				components: [actionRow1],
				embeds: [attachmentAnnounceEmbed(interaction.user.id, attachments.length)]
			});
		} catch (error) {
			throw error;
		}
	}

	private async createAppwriteStorageItem(interaction: Command.ChatInputCommandInteraction, attachment: Attachment) {
		const fileBuffer = await this.getAttachmentBuffer(attachment);
		const itemHash = await sha256Hash(fileBuffer);

		if (await duplicateHashExists(this.container.appwriteTablesDb, itemHash, interaction.guildId!, interaction.user.id)) {
			throw new UserError(generateFailure(ErrorCodes.DuplicateFileError, { fileName: attachment.name || 'unknown' }));
		}

		const fileId = ID.unique();
		const file = bufferToFile(fileBuffer, attachment.name || 'unknown', attachment.contentType || 'application/octet-stream');

		const storageItem = await createStorageFile(this.container.appwriteStorageClient, process.env.APPWRITE_BUCKET_ID!, fileId, file);

		return {
			storageFileId: storageItem.$id,
			type: validImageTypes.includes(attachment.contentType || '') ? ItemsType.IMAGE : ItemsType.VIDEO,
			hash: itemHash,
			sizeBytes: attachment.size
		};
	}

	private async createAppwriteItemRow(
		interaction: Command.ChatInputCommandInteraction,
		storageItem: { storageFileId: string; type: ItemsType; hash: string; sizeBytes: number },
		messageId: string
	) {
		return await this.container.appwriteTablesDb.createRow<Items>({
			databaseId: process.env.APPWRITE_DATABASE_ID!,
			tableId: 'media_items',
			rowId: ID.unique(),
			data: {
				storageFileId: storageItem.storageFileId,
				guildId: interaction.guildId!,
				channelId: interaction.channelId!,
				messageId: messageId,
				authorId: interaction.user.id,
				type: storageItem.type,
				flags: null,
				hash: storageItem.hash,
				sizeBytes: storageItem.sizeBytes,
				accessLogs: []
			}
		});
	}

	private extractAttachmentsFromInteraction(interaction: Command.ChatInputCommandInteraction): Attachment[] {
		const attachments: Attachment[] = [];

		for (let i = 1; i <= 10; i++) {
			const file = interaction.options.getAttachment(`file${i}`);
			if (file) attachments.push(file);
		}

		return attachments;
	}

	private validateAttachments(attachments: Attachment[], validTypes: string[], maxSizeInBytes: number): UserError[] {
		const errors: UserError[] = [];

		// 1. Check file types
		const invalidTypeAttachments = attachments.filter((attachment) => !this.validateFileType(attachment, validTypes));
		if (invalidTypeAttachments.length > 0) {
			errors.push(new UserError(generateFailure(ErrorCodes.InvalidFileType, { invalidFiles: invalidTypeAttachments.map((a) => a.name) })));
		}

		const oversizedAttachments = attachments.filter((attachment) => !this.validateFileSize(attachment, maxSizeInBytes));
		if (oversizedAttachments.length > 0) {
			errors.push(
				new UserError(
					generateFailure(ErrorCodes.FileTooLarge, {
						oversizedFiles: oversizedAttachments.map((a) => a.name)
					})
				)
			);
		}

		return errors;
	}

	private validateFileType(attachment: Attachment, validTypes: string[]): boolean {
		const fileName = attachment.name?.toLowerCase() || '';

		if (fileName) {
			const hasValidExtension = validExtensions.some((ext) => fileName.endsWith(ext));
			if (!hasValidExtension) return false;
		}

		return validTypes.includes(attachment.contentType || '');
	}

	private validateFileSize(attachment: Attachment, maxSizeInBytes: number): boolean {
		return attachment.size <= maxSizeInBytes;
	}

	private async getAttachmentBuffer(attachment: Attachment): Promise<Buffer<ArrayBufferLike>> {
		const response = await fetch(attachment.url);

		if (!response.ok) {
			throw new UserError(generateFailure(ErrorCodes.DownloadError, { fileName: attachment.name || 'unknown' }));
		}

		return Buffer.from(await response.arrayBuffer());
	}
}
