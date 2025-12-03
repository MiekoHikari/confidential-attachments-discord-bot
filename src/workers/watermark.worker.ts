import { createCanvas, loadImage } from 'canvas';
import { execFile } from 'child_process';
import ffmpeg from 'ffmpeg-static';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

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

function createWatermarkBuffer(width: number, height: number, watermark: string): Buffer {
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');

	// More legible: higher opacity, larger font, and text outline
	ctx.font = 'bold 36px sans-serif';
	ctx.textBaseline = 'middle';

	// Rotate context
	ctx.translate(width / 2, height / 2);
	ctx.rotate(-Math.PI / 4);
	ctx.translate(-width / 2, -height / 2);

	const diagonal = Math.sqrt(width * width + height * height);
	const stepX = 350; // Horizontal spacing between tiles
	const stepY = 180; // Vertical spacing between tiles

	const lines = watermark.split('\n');
	const lineHeight = 42;

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

async function getVideoDimensions(videoUrl: string): Promise<{ width: number; height: number }> {
	const ffmpegPath = ffmpeg;
	if (!ffmpegPath) throw new Error('FFmpeg not found');

	try {
		// ffmpeg always exits with error when just reading input info, so we catch it
		await execFileAsync(ffmpegPath, ['-i', videoUrl, '-f', 'null', '-']);
		// If somehow it succeeds without output, return default
		return { width: 1280, height: 720 };
	} catch (error: any) {
		const stderr = error.stderr || '';

		// Try multiple regex patterns to match different ffmpeg output formats
		// Pattern 1: "1920x1080" with optional brackets, SAR, DAR info
		// Pattern 2: Handles various stream formats across different ffmpeg versions
		const patterns = [
			/(\d{2,5})x(\d{2,5})(?:\s|,|\[|$)/, // Simple WxH pattern
			/Video:.+?(\d{2,5})x(\d{2,5})/, // Video: ... WxH
			/, (\d{2,5})x(\d{2,5})[\s,\[]/ // comma space WxH
		];

		for (const pattern of patterns) {
			const match = pattern.exec(stderr);
			if (match) {
				const width = parseInt(match[1]);
				const height = parseInt(match[2]);
				// Sanity check - dimensions should be reasonable
				if (width >= 16 && width <= 7680 && height >= 16 && height <= 4320) {
					return { width, height };
				}
			}
		}

		// Log the stderr for debugging
		console.error('FFmpeg stderr output:', stderr);
		throw new Error(`Could not determine video dimensions. FFmpeg output: ${stderr.slice(0, 500)}`);
	}
}

async function watermarkVideo(videoUrl: string, watermark: string): Promise<Buffer> {
	if (!ffmpeg) throw new Error('FFmpeg not found');

	const { width, height } = await getVideoDimensions(videoUrl);
	const watermarkBuffer = createWatermarkBuffer(width, height, watermark);

	const tempDir = os.tmpdir();
	const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
	const watermarkPath = path.join(tempDir, `watermark-${id}.png`);
	const outputPath = path.join(tempDir, `output-${id}.mp4`);

	await fs.writeFile(watermarkPath, watermarkBuffer);

	try {
		const args = [
			'-i',
			videoUrl,
			'-i',
			watermarkPath,
			'-filter_complex',
			'overlay=0:0',
			'-c:a',
			'copy',
			'-y', // Overwrite output file
			outputPath
		];

		await execFileAsync(ffmpeg, args);

		const outputBuffer = await fs.readFile(outputPath);
		return outputBuffer;
	} finally {
		// Cleanup
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

// Listen for messages from parent process
process.on('message', async (task: WatermarkTask) => {
	const result = await processTask(task);
	process.send!(result);
});
