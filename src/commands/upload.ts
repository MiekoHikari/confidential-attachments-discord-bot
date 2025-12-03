import { ErrorCodes, generateFailure } from '#lib/messages';
import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { Attachment } from 'discord.js';

// Discord Supported file types
const validImageTypes = ['image/jpeg', 'image/png', 'image/gif'];
const validVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-matroska'];
const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.mkv'];

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
		// Get attachments
		const attachments = this.extractAttachmentsFromInteraction(interaction);

		const validTypes = [...validImageTypes, ...validVideoTypes];
		const validAttachments = this.validateAttachments(attachments, validTypes);

		if (validAttachments.length === 0) {
			throw new UserError(generateFailure(ErrorCodes.InvalidFileType, { 'Expected File Types': validTypes }));
		}

		return interaction.reply({ content: 'Hello world!' });
	}

	private extractAttachmentsFromInteraction(interaction: Command.ChatInputCommandInteraction): Attachment[] {
		const attachments: Attachment[] = [];

		for (let i = 1; i <= 10; i++) {
			const file = interaction.options.getAttachment(`file${i}`);
			if (file) attachments.push(file);
		}

		return attachments;
	}

	private validateAttachments(attachments: Attachment[], validTypes: string[]): Attachment[] {
		return attachments.filter((attachment) => this.validateFileType(attachment, validTypes));
	}

	private validateFileType(attachment: Attachment, validTypes: string[]): boolean {
		const fileName = attachment.name?.toLowerCase() || '';

		if (fileName) {
			const hasValidExtension = validExtensions.some((ext) => fileName.endsWith(ext));
			if (!hasValidExtension) return false;
		}

		return validTypes.includes(attachment.contentType || '');
	}
}
