import { createCanvas, loadImage } from 'canvas';
import { execFile } from 'child_process';
import ffmpeg from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { promises as fs } from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

// Worker-specific error class (self-contained, no external dependencies)
class WorkerError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'WorkerError';
	}
}

const execFileAsync = promisify(execFile);

interface WatermarkImageTask {
	type: 'image';
	imageUrl: string;
	watermark: string;
}

interface WatermarkVideoTask {
	type: 'video';
	videoUrl: string;
	watermark: string;
}

type WatermarkTask = WatermarkImageTask | WatermarkVideoTask;

interface WorkerResult {
	success: boolean;
	buffer?: string; // Base64 encoded buffer for IPC transfer
	error?: string;
}

/**
 * Download a file from a URL to a local path
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const protocol = url.startsWith('https') ? https : http;
		const file = require('fs').createWriteStream(destPath);

		protocol
			.get(url, (response) => {
				// Handle redirects
				if (response.statusCode === 301 || response.statusCode === 302) {
					const redirectUrl = response.headers.location;
					if (redirectUrl) {
						file.close();
						downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
						return;
					}
				}

				if (response.statusCode !== 200) {
					file.close();
					reject(new WorkerError(`Failed to download file: HTTP ${response.statusCode}`));
					return;
				}

				response.pipe(file);
				file.on('finish', () => {
					file.close();
					resolve();
				});
			})
			.on('error', (err) => {
				file.close();
				fs.unlink(destPath).catch(() => null);
				reject(err);
			});
	});
}

function createWatermarkBuffer(width: number, height: number, watermark: string): Buffer {
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');

	// More legible: higher opacity, larger font, and text outline
	ctx.font = 'bold 24px sans-serif';
	ctx.textBaseline = 'middle';

	// Rotate context
	ctx.translate(width / 2, height / 2);
	ctx.rotate(-Math.PI / 4);
	ctx.translate(-width / 2, -height / 2);

	const diagonal = Math.sqrt(width * width + height * height);
	const stepX = 350; // Horizontal spacing between tiles
	const stepY = 180; // Vertical spacing between tiles

	const lines = watermark.split('\n');
	const lineHeight = 42 / 2;

	// First layer: Original white watermark
	for (let y = -diagonal; y < diagonal; y += stepY) {
		for (let x = -diagonal; x < diagonal; x += stepX) {
			lines.forEach((line, i) => {
				const drawY = y + i * lineHeight;
				// Draw dark outline for contrast
				ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
				ctx.lineWidth = 3;
				ctx.strokeText(line, x, drawY);
				// Draw white fill
				ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
				ctx.fillText(line, x, drawY);
			});
		}
	}

	ctx.resetTransform();

	// Calculate text dimensions for proper positioning
	const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
	const textHeight = lines.length * lineHeight;

	// Padding from edges
	const padding = 20;

	// Random position ensuring the watermark stays within visible bounds (center area)
	const randomX = padding + Math.random() * (width - textWidth - 2 * padding);
	const randomY = padding + textHeight + Math.random() * (height - 2 * textHeight - 2 * padding);

	lines.forEach((line, i) => {
		const drawY = randomY + i * lineHeight;
		// Draw dark outline for contrast
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
		ctx.lineWidth = 3;
		ctx.strokeText(line, randomX, drawY);
		// Draw teal fill with high opacity
		ctx.fillStyle = 'rgba(0, 255, 255, 0.70)';
		ctx.fillText(line, randomX, drawY);
	});

	return canvas.toBuffer();
}

async function watermarkImage(imageUrl: string, watermark: string): Promise<Buffer> {
	const image = await loadImage(imageUrl);
	const canvas = createCanvas(image.width, image.height);
	const ctx = canvas.getContext('2d');

	ctx.drawImage(image, 0, 0);

	const watermarkBuffer = createWatermarkBuffer(image.width, image.height, watermark);
	const watermarkOverlay = await loadImage(watermarkBuffer);
	ctx.drawImage(watermarkOverlay, 0, 0);

	return canvas.toBuffer();
}

async function getVideoDimensions(localVideoPath: string): Promise<{ width: number; height: number }> {
	const ffprobePath = ffprobeStatic.path;
	if (!ffprobePath) throw new WorkerError('FFprobe is not installed or not found in the system path');

	try {
		// Use ffprobe to get video dimensions in JSON format
		const { stdout } = await execFileAsync(ffprobePath, [
			'-v',
			'error',
			'-select_streams',
			'v:0',
			'-show_entries',
			'stream=width,height',
			'-of',
			'json',
			localVideoPath
		]);

		const probeData = JSON.parse(stdout);

		if (probeData.streams && probeData.streams.length > 0) {
			const { width, height } = probeData.streams[0];
			if (typeof width === 'number' && typeof height === 'number' && width >= 16 && width <= 7680 && height >= 16 && height <= 4320) {
				return { width, height };
			}
		}

		throw new Error('Could not extract valid video dimensions from ffprobe output');
	} catch (error: any) {
		// If it's already a parsed error with a message, rethrow
		if (error.message && !error.stderr) {
			throw error;
		}

		const stderr = error.stderr || '';
		console.error('FFprobe error:', stderr);
		throw new Error(`Could not determine video dimensions. FFprobe output: ${stderr.slice(0, 500)}`);
	}
}

async function watermarkVideo(videoUrl: string, watermark: string): Promise<Buffer> {
	if (!ffmpeg) throw new WorkerError('FFmpeg is not installed or not found in the system path');

	const tempDir = os.tmpdir();
	const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
	const inputPath = path.join(tempDir, `input-${id}.mp4`);
	const watermarkPath = path.join(tempDir, `watermark-${id}.png`);
	const outputPath = path.join(tempDir, `output-${id}.mp4`);

	try {
		// Download the video file first (ffmpeg-static on Linux may not support HTTPS URLs)
		await downloadFile(videoUrl, inputPath);

		// Get dimensions from local file
		const { width, height } = await getVideoDimensions(inputPath);
		const watermarkBuffer = createWatermarkBuffer(width, height, watermark);
		await fs.writeFile(watermarkPath, watermarkBuffer);

		const args = [
			'-i',
			inputPath,
			'-i',
			watermarkPath,
			'-filter_complex',
			'[0:v][1:v]overlay=0:0:format=auto,format=yuv420p',
			'-c:v',
			'libx264',
			'-preset',
			'fast',
			'-crf',
			'23',
			'-c:a',
			'copy',
			'-y', // Overwrite output file
			outputPath
		];

		await execFileAsync(ffmpeg, args);

		const outputBuffer = await fs.readFile(outputPath);
		return outputBuffer;
	} finally {
		// Cleanup all temp files
		await fs.unlink(inputPath).catch(() => null);
		await fs.unlink(watermarkPath).catch(() => null);
		await fs.unlink(outputPath).catch(() => null);
	}
}

async function processTask(task: WatermarkTask): Promise<WorkerResult> {
	try {
		let buffer: Buffer;

		if (task.type === 'image') {
			buffer = await watermarkImage(task.imageUrl, task.watermark);
		} else {
			buffer = await watermarkVideo(task.videoUrl, task.watermark);
		}

		return {
			success: true,
			buffer: buffer.toString('base64')
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

// Wrap the entire worker initialization in try-catch to catch any startup errors
try {
	// Verify required dependencies are available at startup
	if (!ffmpeg) {
		console.error('Worker Error: FFmpeg binary not found');
		process.exit(1);
	}

	if (!ffprobeStatic.path) {
		console.error('Worker Error: FFprobe binary not found');
		process.exit(1);
	}

	// Listen for messages from parent process
	process.on('message', async (task: WatermarkTask) => {
		try {
			const result = await processTask(task);
			if (process.send) {
				process.send(result);
			}
		} catch (error) {
			console.error('Worker message handling error:', error);
			if (process.send) {
				process.send({
					success: false,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}
	});

	// Handle uncaught errors in the worker
	process.on('uncaughtException', (error) => {
		console.error('Worker uncaught exception:', error);
		if (process.send) {
			process.send({
				success: false,
				error: error instanceof Error ? error.message : String(error)
			});
		}
		process.exit(1);
	});

	process.on('unhandledRejection', (reason) => {
		console.error('Worker unhandled rejection:', reason);
		if (process.send) {
			process.send({
				success: false,
				error: reason instanceof Error ? reason.message : String(reason)
			});
		}
	});
} catch (error) {
	console.error('Worker initialization error:', error);
	process.exit(1);
}
