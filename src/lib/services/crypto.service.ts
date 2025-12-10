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
