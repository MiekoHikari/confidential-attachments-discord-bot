import { watermarkQueue, watermarkQueueEvents } from '#lib/services/messageQueue.service';
import { CompletedJobs, Items } from '#lib/types/appwrite';
import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { ID } from 'node-appwrite';

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

		const appwriteItem =
			(await this.container.appwriteTablesDb.getRow({
				databaseId: process.env.APPWRITE_DATABASE_ID!,
				tableId: 'media_items',
				rowId: job.data.appwriteItemId
			})) ?? null;

		if (!appwriteItem)
			return this.container.logger.error(`Appwrite Item with ID ${job.data.appwriteItemId} not found for completed job ${job.data.jobId}`);

		const jobItem = await this.container.appwriteTablesDb.createRow<CompletedJobs>({
			databaseId: process.env.APPWRITE_DATABASE_ID!,
			tableId: 'completed_jobs',
			rowId: ID.unique(),
			data: {
				jobId,
				uploadItem: appwriteItem.$id as unknown as Items,
				accessLog: []
			}
		});

		return jobItem;
	}
}
