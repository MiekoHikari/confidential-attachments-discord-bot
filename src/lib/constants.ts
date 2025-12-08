import { join } from 'path';

export const rootDir = join(__dirname, '..', '..');
export const srcDir = join(rootDir, 'src');

export const RandomLoadingMessage = ['Computing...', 'Thinking...', 'Cooking some food', 'Give me a moment', 'Loading...'];

// Discord Supported file types
export const validImageTypes = ['image/jpeg', 'image/png', 'image/gif'];
export const validVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-matroska'];
export const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.mkv'];
export const maxFileSizeInBytes = 499.9 * 1024 * 1024;
