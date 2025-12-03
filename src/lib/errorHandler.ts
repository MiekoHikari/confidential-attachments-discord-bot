import { UserError } from "@sapphire/framework";

// error codes
export const ErrorCodes = {
	UploadFailed: 'E001',
	FileTooLarge: 'E002',
	InvalidFileType: 'E003',
	PermissionDenied: 'E004',
	InternalError: 'E005',

	PeriodNotStarted: 'E006',
	EnvironmentConfigurationError: 'E007'
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const ErrorMessages: Record<ErrorCode, string> = {
	[ErrorCodes.UploadFailed]: 'The upload failed due to an unknown error.',
	[ErrorCodes.FileTooLarge]: 'The file provided is too large.',
	[ErrorCodes.InvalidFileType]: 'That file type is not supported.',
	[ErrorCodes.PermissionDenied]: 'You do not have permission to perform this action.',
	[ErrorCodes.InternalError]: 'Something went wrong internally.',
	[ErrorCodes.PeriodNotStarted]: 'The confidential period has not started yet.',
	[ErrorCodes.EnvironmentConfigurationError]: 'The environment variable is not configured properly: '
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

export function handleError(eval: () => void) {
	try {
		eval();
	} catch (error) {
		if (error instanceof UserError) {
			
		}
	}