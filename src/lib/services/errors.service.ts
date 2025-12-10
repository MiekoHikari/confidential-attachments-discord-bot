// error codes
export const ErrorCodes = {
	UploadFailed: 'E001',
	FileTooLarge: 'E002',
	InvalidFileType: 'E003',
	PermissionDenied: 'E004',
	InternalError: 'E005',

	PeriodNotStarted: 'E006',
	EnvironmentConfigurationError: 'E007',

	FfmpegNotFound: 'E008',
	DownloadError: 'E009',
	DuplicateFileError: 'E010',

	FileNotFound: 'E011',
	JobNotFound: 'E012',

	DataInconsistencyError: 'E013',
	InvalidFileTypeError: 'E014'
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const ErrorMessages: Record<ErrorCode, string> = {
	[ErrorCodes.UploadFailed]: 'The upload failed due to an unknown error.',
	[ErrorCodes.FileTooLarge]: 'The file provided is too large.',
	[ErrorCodes.InvalidFileType]: 'That file type is not supported.',
	[ErrorCodes.PermissionDenied]: 'You do not have permission to perform this action.',
	[ErrorCodes.InternalError]: 'Something went wrong internally.',
	[ErrorCodes.PeriodNotStarted]: 'The confidential period has not started yet.',
	[ErrorCodes.EnvironmentConfigurationError]: 'The environment variable is not configured properly: ',
	[ErrorCodes.FfmpegNotFound]: 'FFmpeg is not installed or not found in the system path.',
	[ErrorCodes.DownloadError]: 'Failed to download the file from the provided URL.',
	[ErrorCodes.DuplicateFileError]: 'A file with the same content has already been uploaded: ',
	[ErrorCodes.FileNotFound]: 'The requested file was not found.',
	[ErrorCodes.JobNotFound]: 'The requested job was not found.',
	[ErrorCodes.DataInconsistencyError]: 'Data inconsistency detected: ',
	[ErrorCodes.InvalidFileTypeError]: 'The file type is invalid or unsupported: '
};

export function getErrorMessage(code: ErrorCode): string {
	return ErrorMessages[code];
}

export interface FailureContext {
	silent?: boolean;
	[key: string]: unknown;
}

export function generateFailure(code: ErrorCode, context?: FailureContext) {
	return {
		identifier: code,
		message: ErrorMessages[code],
		context: context ?? {}
	};
}
