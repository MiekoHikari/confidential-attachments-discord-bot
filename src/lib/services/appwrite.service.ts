import { UserError } from '@sapphire/framework';
import { ErrorCodes, generateFailure } from './errors.service';
import { Client, ID, Query, Storage, TablesDB } from 'node-appwrite';
import { Attachment } from 'discord.js';
import { Items, ItemsType } from '#lib/types/appwrite';

interface AppwriteServiceConfig {
	endPoint: string;
	projectId: string;
	apiKey: string;
	bucketId: string;
	databaseId: string;
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

	constructor(config: AppwriteServiceConfig) {
		this.config = config;
		this.client = new Client().setEndpoint(config.endPoint).setProject(config.projectId).setKey(config.apiKey);

		this.storageClient = new Storage(this.client);
		this.tablesDb = new TablesDB(this.client);
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
