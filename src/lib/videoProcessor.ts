import { spawn } from 'child_process';
import { createWriteStream, promises as fs } from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

/**
 * Lightweight video processor that runs ffmpeg directly without worker overhead.
 * Uses file streaming to minimize memory usage.
 */

/**
 * Download a file from URL directly to disk (streaming, no memory buffering)
 */
export function downloadFile(url: string, destPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const protocol = url.startsWith('https') ? https : http;
		const file = createWriteStream(destPath);

		protocol
			.get(url, (response) => {
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
					reject(new Error(`Failed to download file: HTTP ${response.statusCode}`));
					return;
				}

				response.pipe(file);
				file.on('finish', () => {
					file.close();
					resolve();
				});
				file.on('error', (err) => {
					file.close();
					reject(err);
				});
			})
			.on('error', (err) => {
				file.close();
				fs.unlink(destPath).catch(() => null);
				reject(err);
			});
	});
}

/**
 * Process video with watermark using ffmpeg's drawtext filter.
 * Returns the path to the output file (caller must clean up).
 */
export async function watermarkVideoToFile(videoUrl: string, watermark: string): Promise<string> {
	const tempDir = os.tmpdir();
	const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
	const inputPath = path.join(tempDir, `input-${id}.mp4`);
	const outputPath = path.join(tempDir, `output-${id}.mp4`);

	// Download video to disk (streaming)
	await downloadFile(videoUrl, inputPath);

	// Escape watermark text for ffmpeg
	const escapedWatermark = watermark.replace(/\\/g, '\\\\').replace(/'/g, "'\\''").replace(/:/g, '\\:').replace(/%/g, '\\%');

	// Simple drawtext filter - much more memory efficient than PNG overlay
	// Creates a grid pattern of watermarks
	const drawTextFilters: string[] = [];

	for (let row = 0; row < 4; row++) {
		for (let col = 0; col < 4; col++) {
			drawTextFilters.push(`drawtext=text='${escapedWatermark}':fontsize=20:fontcolor=white@0.3:x=(w*${col * 0.3}):y=(h*${row * 0.3})`);
		}
	}

	// Add one prominent watermark
	drawTextFilters.push(`drawtext=text='${escapedWatermark}':fontsize=24:fontcolor=cyan@0.6:borderw=1:bordercolor=black@0.4:x=(w-tw)/2:y=(h-th)/2`);

	const filterComplex = drawTextFilters.join(',');

	const args = [
		'-y',
		'-i',
		inputPath,
		'-vf',
		filterComplex,
		'-c:v',
		'libx264',
		'-preset',
		'ultrafast',
		'-crf',
		'28', // Higher CRF = smaller file, less memory
		'-c:a',
		'copy',
		'-threads',
		'1',
		'-max_muxing_queue_size',
		'64', // Reduce muxing buffer
		outputPath
	];

	await new Promise<void>((resolve, reject) => {
		const ffmpeg = spawn('ffmpeg', args, {
			stdio: ['ignore', 'pipe', 'pipe']
		});

		let stderr = '';
		ffmpeg.stderr.on('data', (data) => {
			stderr += data.toString();
		});

		ffmpeg.on('close', (code, signal) => {
			// Clean up input file immediately
			fs.unlink(inputPath).catch(() => null);

			if (code === 0) {
				resolve();
			} else if (signal) {
				reject(new Error(`FFmpeg killed by ${signal}: ${stderr.slice(-500)}`));
			} else {
				reject(new Error(`FFmpeg failed with code ${code}: ${stderr.slice(-500)}`));
			}
		});

		ffmpeg.on('error', (err) => {
			fs.unlink(inputPath).catch(() => null);
			reject(new Error(`FFmpeg error: ${err.message}`));
		});
	});

	return outputPath;
}

/**
 * Clean up a temporary file
 */
export async function cleanupFile(filePath: string): Promise<void> {
	await fs.unlink(filePath).catch(() => null);
}
