import type { ChatInputCommandSuccessPayload, Command, ContextMenuCommandSuccessPayload, MessageCommandSuccessPayload } from '@sapphire/framework';
import { container, UserError } from '@sapphire/framework';
import { send } from '@sapphire/plugin-editable-commands';
import { cyan } from 'colorette';
import { EmbedBuilder, type APIUser, type Guild, type Message, type User } from 'discord.js';
import * as os from 'os';
import { RandomLoadingMessage } from './constants';
import { ErrorCodes, generateFailure } from './errorHandler';

import { Client } from 'node-appwrite';

/**
 * Performance metrics snapshot
 */
export interface PerformanceSnapshot {
	timestamp: number;
	cpuUsage: NodeJS.CpuUsage;
	memoryUsage: NodeJS.MemoryUsage;
	heapStats: {
		heapUsed: number;
		heapTotal: number;
		external: number;
	};
}

/**
 * Performance report with calculated metrics
 */
export interface PerformanceReport {
	duration: number;
	durationFormatted: string;
	memory: {
		startHeapMB: number;
		endHeapMB: number;
		peakHeapMB: number;
		deltaHeapMB: number;
	};
	cpu: {
		userTimeMs: number;
		systemTimeMs: number;
		totalTimeMs: number;
		percentUsage: number;
	};
	system: {
		freeMem: number;
		totalMem: number;
		freeMemMB: number;
		totalMemMB: number;
		memUsagePercent: number;
		loadAvg: number[];
	};
}

/**
 * Performance monitor for tracking resource usage during command execution
 */
export class PerformanceMonitor {
	private startTime: number = 0;
	private startCpuUsage: NodeJS.CpuUsage | null = null;
	private startMemory: NodeJS.MemoryUsage | null = null;
	private peakHeapUsed: number = 0;
	private snapshots: PerformanceSnapshot[] = [];
	private intervalId: NodeJS.Timeout | null = null;

	/**
	 * Start monitoring performance
	 * @param sampleIntervalMs Interval in ms to sample performance (default: 100ms)
	 */
	start(sampleIntervalMs = 100): void {
		this.startTime = performance.now();
		this.startCpuUsage = process.cpuUsage();
		this.startMemory = process.memoryUsage();
		this.peakHeapUsed = this.startMemory.heapUsed;
		this.snapshots = [];

		// Sample performance at intervals
		this.intervalId = setInterval(() => {
			const memUsage = process.memoryUsage();
			if (memUsage.heapUsed > this.peakHeapUsed) {
				this.peakHeapUsed = memUsage.heapUsed;
			}
			this.snapshots.push({
				timestamp: performance.now(),
				cpuUsage: process.cpuUsage(this.startCpuUsage!),
				memoryUsage: memUsage,
				heapStats: {
					heapUsed: memUsage.heapUsed,
					heapTotal: memUsage.heapTotal,
					external: memUsage.external
				}
			});
		}, sampleIntervalMs);
	}

	/**
	 * Stop monitoring and generate a performance report
	 */
	stop(): PerformanceReport {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}

		const endTime = performance.now();
		const duration = endTime - this.startTime;
		const endMemory = process.memoryUsage();
		const endCpuUsage = process.cpuUsage(this.startCpuUsage!);

		// Update peak if current is higher
		if (endMemory.heapUsed > this.peakHeapUsed) {
			this.peakHeapUsed = endMemory.heapUsed;
		}

		const bytesToMB = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;

		const cpuTotalMs = (endCpuUsage.user + endCpuUsage.system) / 1000;
		const cpuPercent = duration > 0 ? Math.round((cpuTotalMs / duration) * 100 * 100) / 100 : 0;

		return {
			duration: Math.round(duration),
			durationFormatted: this.formatDuration(duration),
			memory: {
				startHeapMB: bytesToMB(this.startMemory!.heapUsed),
				endHeapMB: bytesToMB(endMemory.heapUsed),
				peakHeapMB: bytesToMB(this.peakHeapUsed),
				deltaHeapMB: bytesToMB(endMemory.heapUsed - this.startMemory!.heapUsed)
			},
			cpu: {
				userTimeMs: Math.round(endCpuUsage.user / 1000),
				systemTimeMs: Math.round(endCpuUsage.system / 1000),
				totalTimeMs: Math.round(cpuTotalMs),
				percentUsage: cpuPercent
			},
			system: {
				freeMem: os.freemem(),
				totalMem: os.totalmem(),
				freeMemMB: bytesToMB(os.freemem()),
				totalMemMB: bytesToMB(os.totalmem()),
				memUsagePercent: Math.round((1 - os.freemem() / os.totalmem()) * 100 * 100) / 100,
				loadAvg: os.loadavg()
			}
		};
	}

	/**
	 * Format duration in a human-readable format
	 */
	private formatDuration(ms: number): string {
		if (ms < 1000) return `${Math.round(ms)}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
		const minutes = Math.floor(ms / 60000);
		const seconds = ((ms % 60000) / 1000).toFixed(1);
		return `${minutes}m ${seconds}s`;
	}

	/**
	 * Format the performance report as a string for logging or display
	 */
	static formatReport(report: PerformanceReport): string {
		return [
			'📊 **Performance Report**',
			'',
			`⏱️ **Duration:** ${report.durationFormatted}`,
			'',
			'💾 **Memory (Heap):**',
			`  • Start: ${report.memory.startHeapMB} MB`,
			`  • End: ${report.memory.endHeapMB} MB`,
			`  • Peak: ${report.memory.peakHeapMB} MB`,
			`  • Delta: ${report.memory.deltaHeapMB >= 0 ? '+' : ''}${report.memory.deltaHeapMB} MB`,
			'',
			'🔧 **CPU:**',
			`  • User Time: ${report.cpu.userTimeMs}ms`,
			`  • System Time: ${report.cpu.systemTimeMs}ms`,
			`  • Total CPU Time: ${report.cpu.totalTimeMs}ms`,
			`  • CPU Usage: ${report.cpu.percentUsage}%`,
			'',
			'🖥️ **System:**',
			`  • Free Memory: ${report.system.freeMemMB} MB / ${report.system.totalMemMB} MB`,
			`  • System Memory Usage: ${report.system.memUsagePercent}%`,
			`  • Load Average (1m/5m/15m): ${report.system.loadAvg.map((l) => l.toFixed(2)).join(' / ')}`
		].join('\n');
	}

	/**
	 * Get a compact summary for embedding in messages
	 */
	static getCompactSummary(report: PerformanceReport): string {
		return `⏱️ ${report.durationFormatted} | 💾 Peak: ${report.memory.peakHeapMB}MB | 🔧 CPU: ${report.cpu.percentUsage}%`;
	}
}

/**
 * Picks a random item from an array
 * @param array The array to pick a random item from
 * @example
 * const randomEntry = pickRandom([1, 2, 3, 4]) // 1
 */
export function pickRandom<T>(array: readonly T[]): T {
	const { length } = array;
	return array[Math.floor(Math.random() * length)];
}

/**
 * Sends a loading message to the current channel
 * @param message The message data for which to send the loading message
 */
export function sendLoadingMessage(message: Message): Promise<typeof message> {
	return send(message, { embeds: [new EmbedBuilder().setDescription(pickRandom(RandomLoadingMessage)).setColor('#FF0000')] });
}

export function logSuccessCommand(payload: ContextMenuCommandSuccessPayload | ChatInputCommandSuccessPayload | MessageCommandSuccessPayload): void {
	let successLoggerData: ReturnType<typeof getSuccessLoggerData>;

	if ('interaction' in payload) {
		successLoggerData = getSuccessLoggerData(payload.interaction.guild, payload.interaction.user, payload.command);
	} else {
		successLoggerData = getSuccessLoggerData(payload.message.guild, payload.message.author, payload.command);
	}

	container.logger.debug(`${successLoggerData.shard} - ${successLoggerData.commandName} ${successLoggerData.author} ${successLoggerData.sentAt}`);
}

export function getSuccessLoggerData(guild: Guild | null, user: User, command: Command) {
	const shard = getShardInfo(guild?.shardId ?? 0);
	const commandName = getCommandInfo(command);
	const author = getAuthorInfo(user);
	const sentAt = getGuildInfo(guild);

	return { shard, commandName, author, sentAt };
}

function getShardInfo(id: number) {
	return `[${cyan(id.toString())}]`;
}

function getCommandInfo(command: Command) {
	return cyan(command.name);
}

function getAuthorInfo(author: User | APIUser) {
	return `${author.username}[${cyan(author.id)}]`;
}

function getGuildInfo(guild: Guild | null) {
	if (guild === null) return 'Direct Messages';
	return `${guild.name}[${cyan(guild.id)}]`;
}

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function encodeId(id: string): string {
	let num = BigInt(id);
	let result = '';
	while (num > 0n) {
		result = BASE62_CHARS[Number(num % 62n)] + result;
		num /= 62n;
	}
	return result || '0';
}

export function decodeId(encoded: string): string {
	let num = 0n;
	for (const char of encoded) {
		num = num * 62n + BigInt(BASE62_CHARS.indexOf(char));
	}
	return num.toString();
}

/**
 * This function creates an Appwrite client.
 */
export function createAppwriteClient() {
	if (!process.env.APPWRITE_ENDPOINT || !process.env.APPWRITE_PROJECT_ID || !process.env.APPWRITE_API_KEY) {
		throw new UserError(generateFailure(ErrorCodes.EnvironmentConfigurationError));
	} else {
		const client = new Client();

		return client
			.setEndpoint(process.env.APPWRITE_ENDPOINT) // Your API Endpoint
			.setProject(process.env.APPWRITE_PROJECT_ID) // Your project ID
			.setKey(process.env.APPWRITE_API_KEY); // Your secret API key
	}
}
