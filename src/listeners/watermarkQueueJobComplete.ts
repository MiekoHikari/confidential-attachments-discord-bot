import { watermarkQueue, watermarkQueueEvents } from '#lib/services/messageQueue.service';
import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({
	emitter: watermarkQueueEvents,
	event: 'completed'
})
export class UserEvent extends Listener {
	public override async run({ jobId }: { jobId: string }) {
		if (!this.container.client.isReady()) return;
		this.container.logger.info(`Watermark job completed: Job ID ${jobId}`);

		const job = await watermarkQueue.getJob(jobId);
		if (!job) return this.container.logger.error(`Job with ID ${jobId} not found in watermark queue upon completion.`);

		const appwriteItem = await this.container.appwrite.getMediaItemById(job.data.appwriteItemId);

		if (!appwriteItem)
			return this.container.logger.error(`Appwrite Item with ID ${job.data.appwriteItemId} not found for completed job ${job.data.jobId}`);

		const jobItem = await this.container.appwrite.createCompletedJobEntry(jobId, appwriteItem.$id);

		return jobItem;
	}
}
