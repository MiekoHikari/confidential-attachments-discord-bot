import { watermarkQueueEvents } from '#lib/services/messageQueue.service';
import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Job } from 'bullmq';
import { watermarkJob } from '#lib/services/messageQueue.service';

@ApplyOptions<Listener.Options>({
	emitter: watermarkQueueEvents,
	event: 'completed'
})
export class UserEvent extends Listener {
	public override run(job: Job<watermarkJob>) {
		if (!this.container.client.isReady()) return;
		// TODO: Change cams to save file in 'processed/' folder in cold storage.
		this.container.logger.info(`Watermark job completed: Job ID ${job.id}`);

		return job.data;
	}
}
