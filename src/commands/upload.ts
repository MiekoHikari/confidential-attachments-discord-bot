import { ErrorCodes, generateFailure } from '#lib/services/errors.service';
import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { Attachment } from 'discord.js';
import { ID } from 'node-appwrite';

// Discord Supported file types
const validImageTypes = ['image/jpeg', 'image/png', 'image/gif'];
const validVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-matroska'];
const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.mkv'];
const maxFileSizeInBytes = 512 * 1024 * 1024;

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
			// Get attachments
			const attachments = this.extractAttachmentsFromInteraction(interaction);
			const validTypes = [...validImageTypes, ...validVideoTypes];

			// Validation
			const attachmentErrors = this.validateAttachments(attachments, validTypes, maxFileSizeInBytes);

			if (attachmentErrors.length > 0) {
				throw new UserError(generateFailure(ErrorCodes.UploadFailed, { errors: attachmentErrors }));
			}

			// const fileId = ID.unique();

			// const inputFile: File = new File([await this.getAttachmentBuffer(attachments[0])], attachments[0].name || 'unknown', {
			// 	type: attachments[0].contentType || 'application/octet-stream'
			// });

			// const file = this.container.appwriteStorageClient.createFile({
			// 	bucketId: process.env.APPWRITE_BUCKET_ID,
			// 	fileId: fileId,
			// 	file: arrayBuffer
			// });

			// const watermarkText = `${encodeId(interaction.user.id)}#${encodeId(Date.now().toString())}`;

			// const bobClient = this.container.blobContainerClient.getBlockBlobClient(watermarkText);
			// await bobClient.uploadData(await this.getAttachmentBuffer(attachments[0]));

			// const { url } = bobClient;

			// const msg = await interaction.editReply(`Created Job ID: **${watermarkText}**\n${url}`);

			// const job = newJobSchema.parse({
			// 	container: bobClient.containerName,
			// 	jobId: watermarkText,
			// 	type: validImageTypes.includes(attachments[0].contentType || '') ? 'image' : 'video',
			// 	filename: attachments[0].name || 'unknown',
			// 	responseUrl: `${process.env.LOCAL_API_ENDPOINT}/cams`,
			// 	watermarkText,
			// 	interaction: {
			// 		applicationId: interaction.applicationId,
			// 		token: interaction.token,
			// 		messageId: msg.id
			// 	}
			// });

			// await watermarkQueue.add('watermark', job, {
			// 	jobId: watermarkText
			// });
		} catch (error) {
			throw error;
		}
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
