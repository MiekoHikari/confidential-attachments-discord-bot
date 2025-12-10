import { UserError } from '@sapphire/framework';
import { ErrorCodes, generateFailure } from './errors.service';
import { Client, ID, Models, Query, Storage, TablesDB } from 'node-appwrite';
import { Attachment } from 'discord.js';
import { AccessLogs, AccessLogsAccessType, CompletedJobs, Items, ItemsType } from '#lib/types/appwrite';
import { encodeId } from './crypto.service';
import { watermarkJob, watermarkQueue } from './messageQueue.service';
import { ContainerClient } from '@azure/storage-blob';

interface AppwriteServiceConfig {
	endPoint: string;
	projectId: string;
	apiKey: string;
	bucketId: string;
	databaseId: string;
	azureBlobContainerClient: ContainerClient;
}

interface MediaItem {
	storageFileId: string;
	type: ItemsType;
	hash: string;
	sizeBytes: number;
}

export class Appwrite {
	private client: Client;
	private config: AppwriteServiceConfig;

	public storageClient: Storage;
	public tablesDb: TablesDB;
	public azureBlobContainerClient: ContainerClient;

	constructor(config: AppwriteServiceConfig) {
		this.config = config;
		this.client = new Client().setEndpoint(config.endPoint).setProject(config.projectId).setKey(config.apiKey);

		this.storageClient = new Storage(this.client);
		this.tablesDb = new TablesDB(this.client);

		this.azureBlobContainerClient = config.azureBlobContainerClient;
	}

	public async uploadConfidentialMedia(attachment: Attachment, context: { guildId: string; authorId: string; channelId: string }) {
		const fileBuffer = await Appwrite.getAttachmentBuffer(attachment);

		const itemHash = await Appwrite.sha256Hash(fileBuffer);

		const mediaType = Appwrite.resolveFileType(attachment.contentType);
		if (!mediaType) throw new UserError(generateFailure(ErrorCodes.InvalidFileTypeError, { fileName: attachment.name || 'unknown' }));

		const isDuplicate = await this.checkDuplicateHash(itemHash, context.guildId, context.authorId);
		if (isDuplicate) throw new UserError(generateFailure(ErrorCodes.DuplicateFileError, { fileName: attachment.name || 'unknown' }));

		const storageItem = await this.uploadToStorage(fileBuffer, attachment.name, attachment.contentType);

		const mediaItem: MediaItem = {
			storageFileId: storageItem.id,
			type: mediaType,
			hash: itemHash,
			sizeBytes: attachment.size
		};

		const row = await this.createMediaItemRow(mediaItem, context);

		return { mediaItem, row };
	}

	public async updateMediaItemMessageId(itemId: string, messageId: string) {
		return await this.tablesDb.updateRow<Items>({
			databaseId: this.config.databaseId,
			tableId: 'media_items',
			rowId: itemId,
			data: {
				messageId: messageId
			}
		});
	}

	public async getMediaItemById(rowId: string) {
		return (
			(await this.tablesDb.getRow<Items>({
				databaseId: this.config.databaseId,
				tableId: 'media_items',
				rowId: rowId
			})) ?? null
		);
	}

	public async getStorageFile(fileId: string) {
		const metadata = await this.storageClient.getFile({
			bucketId: this.config.bucketId,
			fileId
		});

		if (!metadata) return null;

		const file = await this.storageClient.getFileDownload({
			bucketId: this.config.bucketId,
			fileId
		});

		return { file, metadata };
	}

	public async listViewerAccessLogs(userId: string, itemId: string) {
		const accessLogs = await this.tablesDb.listRows<AccessLogs>({
			databaseId: this.config.databaseId,
			tableId: 'access_logs',
			queries: [
				Query.select(['completedJob.$id', 'completedJob.jobId', 'item.$id', '$id', '$createdAt']),
				Query.equal('viewerId', userId),
				Query.limit(100)
			]
		});

		return accessLogs.rows.filter((log) => log.item.$id === itemId);
	}

	public async createWatermarkJob(userId: string, buffer: ArrayBuffer, metadata: Models.File, itemId: string) {
		const jobId = `${encodeId(userId)}#${encodeId(Date.now().toString())}`;

		const blobClient = this.azureBlobContainerClient.getBlockBlobClient(jobId);
		await blobClient.uploadData(buffer);

		const jobPayload: watermarkJob = {
			container: blobClient.containerName,
			jobId,
			type: Appwrite.resolveFileType(metadata.mimeType) === ItemsType.IMAGE ? 'image' : 'video',
			filename: `${jobId}.${metadata.mimeType.split('/').pop()}`,
			watermarkText: jobId,
			appwriteItemId: itemId
		};

		await watermarkQueue.add('watermark', jobPayload, { jobId });

		return jobId;
	}

	public async fetchCompletedJob(jobId: string) {
		return (
			(await this.tablesDb.listRows<CompletedJobs>({
				databaseId: this.config.databaseId,
				tableId: 'completed_jobs',
				queries: [Query.equal('jobId', jobId), Query.select(['uploadItem.*', 'jobId']), Query.limit(1)]
			})) ?? null
		).rows[0];
	}

	public async createAccessLogEntry(userId: string, item: Items, completedJobRowId: string, type: AccessLogsAccessType) {
		const rowId = ID.unique();

		return await this.tablesDb.createRow<AccessLogs>({
			databaseId: this.config.databaseId,
			tableId: 'access_logs',
			rowId: rowId,
			data: {
				viewerId: userId,
				item: item.$id as unknown as Items,
				completedJob: completedJobRowId as unknown as CompletedJobs,
				accessType: type,
				guildId: item.guildId,
				channelId: item.channelId
			}
		});
	}

	public async getProcessedJob(jobId: string) {
		const blobItem = this.azureBlobContainerClient.getBlockBlobClient(`processed/${jobId}`);
		const exists = await blobItem.exists();

		if (!exists) return null;

		const downloadResponse = await blobItem.downloadToBuffer();
		if (downloadResponse.length === 0) return null;

		const properties = await blobItem.getProperties();

		return { buffer: downloadResponse, contentType: properties.contentType || 'application/octet-stream' };
	}

	private async createMediaItemRow(mediaItem: MediaItem, context: { guildId: string; channelId: string; authorId: string }) {
		const rowId = ID.unique();

		return await this.tablesDb.createRow<Items>({
			databaseId: this.config.databaseId,
			tableId: 'media_items',
			rowId: rowId,
			data: {
				storageFileId: mediaItem.storageFileId,
				guildId: context.guildId,
				channelId: context.channelId,
				messageId: null,
				authorId: context.authorId,
				type: mediaItem.type,
				flags: null,
				hash: mediaItem.hash,
				sizeBytes: mediaItem.sizeBytes,
				accessLogs: []
			}
		});
	}

	private async uploadToStorage(fileBuffer: Buffer, fileName?: string | null, contentType?: string | null) {
		const fileId = ID.unique();

		const file = Appwrite.bufferToFile(fileBuffer, fileName || 'unknown', contentType || 'application/octet-stream');

		const result = await this.storageClient.createFile({
			bucketId: this.config.bucketId,
			fileId: fileId,
			file: file
		});

		return { id: result.$id };
	}

	private async checkDuplicateHash(itemHash: string, guildId: string, authorId: string): Promise<boolean> {
		const existingItems = await this.tablesDb.listRows({
			databaseId: process.env.APPWRITE_DATABASE_ID!,
			tableId: 'media_items',
			queries: [Query.equal('hash', itemHash), Query.equal('authorId', authorId), Query.equal('guildId', guildId), Query.limit(1)]
		});

		return existingItems.total > 0;
	}

	public static bufferToFile(buffer: Buffer, fileName: string, mimeType: string) {
		return new File([buffer], fileName, { type: mimeType });
	}

	public static resolveFileType(contentType: string | null | undefined): ItemsType | null {
		if (!contentType) return null;
		if (contentType.startsWith('image/')) return ItemsType.IMAGE;
		if (contentType.startsWith('video/')) return ItemsType.VIDEO;

		return null;
	}

	public static async getAttachmentBuffer(attachment: Attachment): Promise<Buffer<ArrayBufferLike>> {
		const response = await fetch(attachment.url);

		if (!response.ok) {
			throw new UserError(generateFailure(ErrorCodes.DownloadError, { fileName: attachment.name || 'unknown' }));
		}

		return Buffer.from(await response.arrayBuffer());
	}

	public static async sha256Hash(data: Buffer): Promise<string> {
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

		return hashHex;
	}
}
