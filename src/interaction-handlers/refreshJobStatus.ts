import { refreshButton } from '#lib/services/cams.service';
import { ErrorCodes, generateFailure } from '#lib/services/errors.service';
import { AccessLogsAccessType } from '#lib/types/appwrite';
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes, UserError } from '@sapphire/framework';
import { ActionRowBuilder, AttachmentBuilder, MessageActionRowComponentBuilder, type ButtonInteraction } from 'discord.js';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, jobId: string) {
		await interaction.deferUpdate();
		const refreshButtonComponent = refreshButton(jobId).setDisabled(true);

		await interaction.editReply({
			components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(refreshButtonComponent)]
		});

		const watermarkJob = await this.container.appwrite.fetchCompletedJob(jobId);

		if (watermarkJob) {
			const log = await this.container.appwrite.createAccessLogEntry(
				interaction.user.id,
				watermarkJob.uploadItem,
				watermarkJob.$id,
				AccessLogsAccessType.FIRST_TIME
			);

			const processedFile = await this.container.appwrite.getProcessedJob(log.completedJob.jobId);
			if (!processedFile)
				throw new UserError(
					generateFailure(ErrorCodes.FileNotFound, { errors: [`Processed file for job ID ${log.completedJob.jobId} not found.`] })
				);

			const attachment = new AttachmentBuilder(processedFile.buffer, {
				name: `${log.$id}.${processedFile.contentType.split('/').pop()}`
			});
			return await interaction.editReply({
				content: `Your file is ready! Here is your confidential attachment:`,
				components: [],
				embeds: [],
				files: [attachment]
			});
		}

		refreshButtonComponent.setDisabled(false);

		// 5 second cooldown before allowing another refresh
		await new Promise((resolve) => setTimeout(resolve, 5000));

		return await interaction.editReply({
			content: `Your watermark job is still being processed. Please try again later.`,
			components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(refreshButtonComponent)]
		});
	}

	public override parse(interaction: ButtonInteraction) {
		const [command, id, tag] = interaction.customId.split('#');
		if (command !== 'refresh') return this.none();

		return this.some(`${id}#${tag}`);
	}
}
