import { FailureContext } from '#lib/messages';
import { ChatInputCommandDeniedPayload, Events, Listener, UserError } from '@sapphire/framework';
import { EmbedBuilder } from 'discord.js';

export class UserEvent extends Listener<typeof Events.ChatInputCommandDenied> {
	public override async run(error: UserError, { interaction }: ChatInputCommandDeniedPayload) {
		const { message: content, identifier } = error;
		const context = error.context as FailureContext;

		// Silent errors
		if (context.silent) return;

		const failureEmbed = new EmbedBuilder()
			.setDescription('# Command Failed!\n' + `> ${content}`)
			.setTimestamp()
			.setColor('Red')
			.setThumbnail('https://cdn3.emoji.gg/emojis/5959-failed.gif')
			.setFooter({ text: `Error Code: ${identifier}` });

		if (context) {
			for (const [key, value] of Object.entries(context)) {
				failureEmbed.addFields({ name: `Context: ${key}`, value: `\`\`\`${String(value)}\`\`\`` });
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
