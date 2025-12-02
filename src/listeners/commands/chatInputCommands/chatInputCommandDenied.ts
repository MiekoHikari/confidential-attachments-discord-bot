import type { ChatInputCommandDeniedPayload, Events } from '@sapphire/framework';
import { Listener, UserError } from '@sapphire/framework';
import { EmbedBuilder } from 'discord.js';

export class UserEvent extends Listener<typeof Events.ChatInputCommandDenied> {
	public override async run({ context, message: content, identifier: identifier }: UserError, { interaction }: ChatInputCommandDeniedPayload) {
		// `context: { silent: true }` should make UserError silent:
		// Use cases for this are for example permissions error when running the `eval` command.
		if (Reflect.get(Object(context), 'silent')) return;

		const failureEmbed = new EmbedBuilder()
			.setDescription('# Command Failed!\n' + `> ${content}`)
			.setTimestamp()
			.setColor('Red')
			.setThumbnail('https://cdn3.emoji.gg/emojis/5959-failed.gif')
			.setFooter({ text: `Error Code: ${identifier}` });

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
