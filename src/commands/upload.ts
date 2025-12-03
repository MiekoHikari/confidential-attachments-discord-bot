import { ErrorCodes, generateFailure } from '#lib/errorHandler';
import { generateId, PerformanceMonitor } from '#lib/utils';
import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { fork, type ChildProcess } from 'child_process';
import { Attachment, AttachmentBuilder } from 'discord.js';
import * as path from 'path';

// Discord Supported file types
const validImageTypes = ['image/jpeg', 'image/png', 'image/gif'];
const validVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-matroska'];
const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.mkv'];
const maxFileSizeInBytes = 512 * 1024 * 1024;

interface WorkerResult {
	success: boolean;
	buffer?: string; // Base64 encoded
	error?: string;
}

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

	/**
	 * Run watermarking in a separate child process to avoid blocking the main event loop
	 */
	private runWatermarkWorker(
		task: { type: 'image'; imageUrl: string; watermark: string } | { type: 'video'; videoUrl: string; watermark: string }
	): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			// Resolve the worker path - in production it will be compiled to JS
			const workerPath = path.resolve(__dirname, '../workers/watermark.worker.js');

			const child: ChildProcess = fork(workerPath, [], {
				stdio: ['pipe', 'pipe', 'pipe', 'ipc']
			});

			let stderrData = '';
			let stdoutData = '';
			let settled = false;

			const settle = (fn: () => void) => {
				if (!settled) {
					settled = true;
					fn();
				}
			};

			// Capture stderr for debugging
			if (child.stderr) {
				child.stderr.on('data', (data) => {
					stderrData += data.toString();
				});
			}

			// Capture stdout for debugging
			if (child.stdout) {
				child.stdout.on('data', (data) => {
					stdoutData += data.toString();
				});
			}

			child.on('message', (result: WorkerResult) => {
				if (result.success && result.buffer) {
					settle(() => resolve(Buffer.from(result.buffer!, 'base64')));
				} else {
					settle(() => reject(new Error(result.error || 'Unknown worker error')));
				}
				child.kill();
			});

			child.on('error', (error) => {
				settle(() => reject(error));
				child.kill();
			});

			child.on('exit', (code, signal) => {
				if (!settled) {
					const errorDetails = stderrData || stdoutData || 'No additional error output';
					if (signal) {
						settle(() => reject(new Error(`Worker killed by signal ${signal}. Details: ${errorDetails}`)));
					} else if (code !== 0) {
						settle(() => reject(new Error(`Worker exited with code ${code}. Details: ${errorDetails}`)));
					}
				}
			});

			// Send the task to the child process
			child.send(task);
		});
	}

	private async watermarkImage(imageUrl: string, watermark: string): Promise<Buffer> {
		return this.runWatermarkWorker({ type: 'image', imageUrl, watermark });
	}

	private async watermarkVideo(videoUrl: string, watermark: string): Promise<Buffer> {
		return this.runWatermarkWorker({ type: 'video', videoUrl, watermark });
	}
}
