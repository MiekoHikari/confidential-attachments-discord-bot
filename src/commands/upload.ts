// TODO: Interaction Timeout handling for large files
// TODO: Turn Repository into Monorepo for better structure and create an upload container queue
// TODO: Parallel Process Multiple Attachments within 15 minute interaction window
import { maxFileSizeInBytes, validExtensions, validImageTypes, validVideoTypes } from '#lib/constants';
import { ErrorCodes, generateFailure } from '#lib/services/errors.service';
import { ItemsType } from '#lib/types/appwrite';
import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ActionRowBuilder, Attachment, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageActionRowComponentBuilder } from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Upload images/videos as confidential attachments',
	preconditions: ['activePeriod'],
	cooldownDelay: 150_000,
	requiredClientPermissions: ['SendMessages', 'EmbedLinks', 'AttachFiles']
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			const command = builder.setName(this.name).setDescription(this.description!);

			for (let i = 1; i <= 10; i++) {
				command.addAttachmentOption((option) =>
					option
						.setName(`file${i}`)
						.setDescription(
							`Media can be images or videos. Max file size is ${maxFileSizeInBytes / (1024 * 1024)} MB. The bigger the file, the longer the upload time.`
						)
						.setRequired(i === 1)
				);
			}

			return command;
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: ['Ephemeral'] });

		try {
			if (!interaction.channel?.isSendable())
				throw new UserError(
					generateFailure(ErrorCodes.UploadFailed, { errors: ['Bot does not have permission to send messages in this channel.'] })
				);

			const attachments = this.extractAttachmentsFromInteraction(interaction);

			const attachmentErrors = this.validateAttachments(attachments);

			if (attachmentErrors.length > 0) {
				throw new UserError(generateFailure(ErrorCodes.UploadFailed, { errors: attachmentErrors }));
			}

			const uploadResult = await this.container.appwrite.uploadConfidentialMedia(attachments[0], {
				guildId: interaction.guildId!,
				authorId: interaction.user.id,
				channelId: interaction.channelId!
			});

			const actionRow1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				new ButtonBuilder()
					.setLabel(attachments[0].name)
					.setCustomId(`viewFile#${uploadResult.row.$id}`)
					.setStyle(ButtonStyle.Secondary)
					.setEmoji(uploadResult.mediaItem.type === ItemsType.IMAGE ? '🖼️' : '🎬')
			);

			return interaction.channel.send({
				components: [actionRow1],
				embeds: [this.attachmentAnnounceEmbed(interaction.user.id, attachments.length)]
			});
		} catch (error) {
			throw error;
		}
	}

	private attachmentAnnounceEmbed(userId: string, length: number) {
		return new EmbedBuilder()
			.setColor('White')
			.setDescription(
				`### <@${userId}> has just uploaded ${length} file${length !== 1 ? 's' : ''}! \
            \n> - Click the button(s) below to view the uploaded media. \
            \n> - A watermark will be applied when you click the button. Generation may take a few moments depending on the file size. \
            \n> - **Do not share these files outside of this server!**`
			)
			.setThumbnail('https://cdn3.emoji.gg/emojis/73057-anonymous.png')
			.setTimestamp();
	}

	private extractAttachmentsFromInteraction(interaction: Command.ChatInputCommandInteraction): Attachment[] {
		const attachments: Attachment[] = [];

		for (let i = 1; i <= 10; i++) {
			const file = interaction.options.getAttachment(`file${i}`);
			if (file) attachments.push(file);
		}

		return attachments;
	}

	private validateAttachments(attachments: Attachment[]): UserError[] {
		const errors: UserError[] = [];
		const validTypes = [...validImageTypes, ...validVideoTypes];

		// 1. Check file types
		const invalidTypeAttachments = attachments.filter((attachment) => !this.validateFileType(attachment, validTypes));
		if (invalidTypeAttachments.length > 0) {
			errors.push(new UserError(generateFailure(ErrorCodes.InvalidFileType, { invalidFiles: invalidTypeAttachments.map((a) => a.name) })));
		}

		const oversizedAttachments = attachments.filter((attachment) => !this.validateFileSize(attachment, maxFileSizeInBytes));
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
