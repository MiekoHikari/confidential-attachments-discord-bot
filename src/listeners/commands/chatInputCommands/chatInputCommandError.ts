import { FailureContext } from '#lib/services/errors.service';
import { ChatInputCommandErrorPayload, Events, Listener, UserError } from '@sapphire/framework';
import { EmbedBuilder } from 'discord.js';

export class UserEvent extends Listener<typeof Events.ChatInputCommandError> {
	public override async run(error: Error, { interaction }: ChatInputCommandErrorPayload) {
		// Check if it's a UserError with context
		const isUserError = error instanceof UserError;
		const context = isUserError ? (error.context as FailureContext | undefined) : undefined;

		// Silent errors
		if (context?.silent) return;

		const content = error.message;
		const identifier = isUserError ? error.identifier : 'UNKNOWN_ERROR';

		const failureEmbed = new EmbedBuilder()
			.setDescription('# Command Failed!\n' + `> ${content}`)
			.setTimestamp()
			.setColor('Red')
			.setThumbnail('https://cdn3.emoji.gg/emojis/5959-failed.gif')
			.setFooter({ text: `Error Code: ${identifier}` });

		if (context) {
			for (const [key, value] of Object.entries(context)) {
				if (key !== 'silent') {
					failureEmbed.addFields({ name: `Context: ${key}`, value: `\`\`\`${String(value)}\`\`\`` });
				}
			}
		}

		if (interaction.deferred || interaction.replied) {
			return interaction.editReply({
				content: '',
				components: [],
				embeds: [failureEmbed],
				allowedMentions: { users: [interaction.user.id], roles: [] }
			});
		}

		return interaction.reply({
			content: '',
			components: [],
			embeds: [failureEmbed],
			allowedMentions: { users: [interaction.user.id], roles: [] },
			flags: ['Ephemeral']
		});
	}
}
