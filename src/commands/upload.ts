import { ErrorCodes, generateFailure } from '#lib/errorHandler';
import { generateId, PerformanceMonitor } from '#lib/utils';
import { cleanupFile, watermarkImage, watermarkVideoToFile } from '#lib/videoProcessor';
import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { Attachment, AttachmentBuilder } from 'discord.js';
import { createReadStream } from 'fs';

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

		// Start performance monitoring
		const perfMonitor = new PerformanceMonitor();
		perfMonitor.start(100); // Sample every 100ms

		try {
			// Get attachments
			const attachments = this.extractAttachmentsFromInteraction(interaction);
			const validTypes = [...validImageTypes, ...validVideoTypes];

			// Validation
			const attachmentErrors = this.validateAttachments(attachments, validTypes, maxFileSizeInBytes);

			if (attachmentErrors.length > 0) {
				throw new UserError(generateFailure(ErrorCodes.UploadFailed, { errors: attachmentErrors }));
			}

			const processedFiles: AttachmentBuilder[] = [];
			const tempFilesToCleanup: string[] = [];
			const watermarkText = generateId(6);

			try {
				// Process files
				for (const [index, attachment] of attachments.entries()) {
					await interaction.editReply(`Processing file: ${index + 1} / ${attachments.length}...`);

					if (validImageTypes.includes(attachment.contentType!)) {
						// Images: process directly in main process
						const processedBuffer = await watermarkImage(attachment.url, watermarkText);
						processedFiles.push(new AttachmentBuilder(processedBuffer, { name: `confidential-${attachment.name}` }));
					} else {
						// Videos: process directly without worker, use file stream
						const outputPath = await watermarkVideoToFile(attachment.url, watermarkText);
						tempFilesToCleanup.push(outputPath);

						// Use file stream instead of loading entire file into memory
						processedFiles.push(new AttachmentBuilder(createReadStream(outputPath), { name: `confidential-${attachment.name}` }));
					}
				}

				// Stop monitoring and get report
				const perfReport = perfMonitor.stop();
				const perfSummary = PerformanceMonitor.getCompactSummary(perfReport);

				// Log detailed performance report to console
				this.container.logger.info(`[Upload Command] Performance:\n${PerformanceMonitor.formatReport(perfReport)}`);

				const result = await interaction.editReply({
					content: `✅ Upload Complete!\n\n${perfSummary}`,
					files: processedFiles
				});

				return result;
			} finally {
				// Always cleanup temp files
				for (const filePath of tempFilesToCleanup) {
					await cleanupFile(filePath);
				}
			}
		} catch (error) {
			// Stop monitoring even on error
			const perfReport = perfMonitor.stop();
			this.container.logger.info(`[Upload Command] Failed - Performance:\n${PerformanceMonitor.formatReport(perfReport)}`);
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
}
