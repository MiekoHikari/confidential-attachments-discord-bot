// error codes
export const ErrorCodes = {
	UploadFailed: 'E001',
	FileTooLarge: 'E002',
	InvalidFileType: 'E003',
	PermissionDenied: 'E004',
	PeriodNotStarted: 'E005',
	InternalError: 'E006'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export const ErrorMessages: Record<ErrorCode, string> = {
	[ErrorCodes.UploadFailed]: 'The upload failed due to an unknown error.',
	[ErrorCodes.FileTooLarge]: 'The file provided is too large.',
	[ErrorCodes.InvalidFileType]: 'That file type is not supported.',
	[ErrorCodes.PermissionDenied]: 'You do not have permission to perform this action.',
	[ErrorCodes.InternalError]: 'Something went wrong internally.',
    [ErrorCodes.PeriodNotStarted]: 'The confidential period has not started yet.'
};

export function getErrorMessage(code: ErrorCode): string {
	return ErrorMessages[code];
}

export function generateFailure(code: ErrorCode) {
	return {
		identifier: code,
		message: ErrorMessages[code]
	};
}