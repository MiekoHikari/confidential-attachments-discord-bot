import { ErrorCodes, generateFailure } from '#lib/errorHandler';
import { generateId, PerformanceMonitor } from '#lib/utils';
import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { createCanvas, loadImage } from 'canvas';
import { execFile } from 'child_process';
import { Attachment, AttachmentBuilder } from 'discord.js';
import ffmpeg from 'ffmpeg-static';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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
			const watermarkText = generateId(6);

			// Process files
			for (const [index, attachment] of attachments.entries()) {
				await interaction.editReply(`Processing file: ${index + 1} / ${attachments.length}...`);

				let processedBuffer: Buffer;

				if (validImageTypes.includes(attachment.contentType!)) {
					processedBuffer = await this.watermarkImage(attachment.url, watermarkText);
				} else {
					processedBuffer = await this.watermarkVideo(attachment.url, watermarkText);
				}

				processedFiles.push(new AttachmentBuilder(processedBuffer, { name: `confidential-${attachment.name}` }));
			}

			// Stop monitoring and get report
			const perfReport = perfMonitor.stop();
			const perfSummary = PerformanceMonitor.getCompactSummary(perfReport);

			// Log detailed performance report to console
			this.container.logger.info(`[Upload Command] Performance:\n${PerformanceMonitor.formatReport(perfReport)}`);

			return interaction.editReply({
				content: `✅ Upload Complete!\n\n${perfSummary}`,
				files: processedFiles
			});
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

	private async watermarkImage(imageUrl: string, watermark: string): Promise<Buffer> {
		const image = await loadImage(imageUrl);
		const canvas = createCanvas(image.width, image.height);
		const ctx = canvas.getContext('2d');

		ctx.drawImage(image, 0, 0);

		const watermarkBuffer = this.createWatermarkBuffer(image.width, image.height, watermark);
		const watermarkOverlay = await loadImage(watermarkBuffer);
		ctx.drawImage(watermarkOverlay, 0, 0);

		return canvas.toBuffer();
	}

	private async watermarkVideo(videoUrl: string, watermark: string): Promise<Buffer> {
		if (!ffmpeg) throw new Error('FFmpeg not found');

		const { width, height } = await this.getVideoDimensions(videoUrl);
		const watermarkBuffer = this.createWatermarkBuffer(width, height, watermark);

		const tempDir = os.tmpdir();
		const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
		const watermarkPath = path.join(tempDir, `watermark-${id}.png`);
		const outputPath = path.join(tempDir, `output-${id}.mp4`);

		await fs.writeFile(watermarkPath, watermarkBuffer);

		try {
			const args = [
				'-i',
				videoUrl,
				'-i',
				watermarkPath,
				'-filter_complex',
				'overlay=0:0',
				'-c:a',
				'copy',
				'-y', // Overwrite output file
				outputPath
			];

			await execFileAsync(ffmpeg, args);

			const outputBuffer = await fs.readFile(outputPath);
			return outputBuffer;
		} finally {
			// Cleanup
			await fs.unlink(watermarkPath).catch(() => null);
			await fs.unlink(outputPath).catch(() => null);
		}
	}

	private createWatermarkBuffer(width: number, height: number, watermark: string): Buffer {
		const canvas = createCanvas(width, height);
		const ctx = canvas.getContext('2d');

		// More legible: higher opacity, larger font, and text outline
		ctx.font = 'bold 36px sans-serif';
		ctx.textBaseline = 'middle';

		// Rotate context
		ctx.translate(width / 2, height / 2);
		ctx.rotate(-Math.PI / 4);
		ctx.translate(-width / 2, -height / 2);

		const diagonal = Math.sqrt(width * width + height * height);
		const stepX = 350; // Horizontal spacing between tiles
		const stepY = 180; // Vertical spacing between tiles

		const lines = watermark.split('\n');
		const lineHeight = 42;

		for (let y = -diagonal; y < diagonal; y += stepY) {
			for (let x = -diagonal; x < diagonal; x += stepX) {
				lines.forEach((line, i) => {
					const drawY = y + i * lineHeight;
					// Draw dark outline for contrast
					ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
					ctx.lineWidth = 3;
					ctx.strokeText(line, x, drawY);
					// Draw white fill
					ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
					ctx.fillText(line, x, drawY);
				});
			}
		}

		return canvas.toBuffer();
	}

	private async getVideoDimensions(videoUrl: string): Promise<{ width: number; height: number }> {
		const ffmpegPath = ffmpeg;
		if (!ffmpegPath) throw new UserError(generateFailure(ErrorCodes.FfmpegNotFound));

		try {
			await execFileAsync(ffmpegPath, ['-i', videoUrl]);
			return { width: 1280, height: 720 };
		} catch (error: any) {
			const stderr = error.stderr || '';
			const match = /Stream #.+Video:.+, (\d+)x(\d+)/.exec(stderr);
			if (match) {
				return { width: parseInt(match[1]), height: parseInt(match[2]) };
			}
			throw new Error('Could not determine video dimensions');
		}
	}
}
