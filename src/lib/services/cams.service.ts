import { EmbedBuilder } from 'discord.js';

export function attachmentAnnounceEmbed(userId: string, length: number) {
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
