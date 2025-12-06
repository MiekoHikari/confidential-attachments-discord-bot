import { decodeId } from '#lib/utils';
import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
	description: 'Decode a confidential attachment ID'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder //
				.setName(this.name)
				.setDescription(this.description)
				.addStringOption((option) => option.setName('encoded_id').setDescription('The encoded ID to decode').setRequired(true))
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const encodedId = interaction.options.getString('encoded_id', true);

		const decodedId = decodeId(encodedId);

		// Check if user is in the server
		const member = await interaction.guild?.members.fetch(decodedId);
		if (!member) return interaction.reply({ content: `User not found in this server. Decode Results: ${decodedId}`, flags: ['Ephemeral'] });

		return interaction.reply({ content: `Found ${member} with ID: ${decodedId}`, flags: ['Ephemeral'] });
	}
}
