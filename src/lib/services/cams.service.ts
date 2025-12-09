import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageActionRowComponentBuilder } from 'discord.js';

export const refreshButtonRow = (jobId: string) => new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(refreshButton(jobId));

export const refreshButton = (jobId: string) =>
	new ButtonBuilder().setLabel('Refresh Status').setCustomId(`refresh#${jobId}`).setStyle(ButtonStyle.Primary).setEmoji('✨');
