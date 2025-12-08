import { Queue, QueueEvents } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import z from 'zod';

export const newJobSchema = z.object({
	container: z.string().min(1),
	jobId: z.string().min(1),
	type: z.enum(['image', 'video']),
	filename: z.string().min(1),
	watermarkText: z.string().min(1),
	interaction: z.object({
		applicationId: z.string().min(1),
		token: z.string().min(1),
		messageId: z.string().min(1)
	})
});

export interface watermarkJob {
	container: string;
	jobId: string;
	type: 'image' | 'video';
	filename: string;
	watermarkText: string;
	interaction: {
		applicationId: string;
		token: string;
		messageId: string;
	};
}

// Redis connection config shared between Queue and Worker
export const redisConnection: ConnectionOptions = {
	url: process.env.REDIS_URL,
	// Improve connection resilience
	maxRetriesPerRequest: null, // Required for BullMQ workers - disables the retry limit
	enableReadyCheck: false, // Prevents blocking when Redis is temporarily unavailable
	retryStrategy: (times: number) => {
		// Exponential backoff with max 30 second delay
		const delay = Math.min(times * 500, 30000);
		console.log(`[REDIS] Reconnecting... attempt ${times}, delay ${delay}ms`);
		return delay;
	}
};

// Queue for watermark processing jobs
export const watermarkQueue = new Queue<watermarkJob>('watermark', {
	connection: redisConnection,
	defaultJobOptions: {
		attempts: 3,
		backoff: {
			type: 'exponential',
			delay: 2000
		},
		removeOnComplete: 10, // Keep last 10 completed jobs
		removeOnFail: 100 // Keep last 100 failed jobs for debugging
	}
});

export const watermarkQueueEvents = new QueueEvents('watermark', {
	connection: redisConnection
});
