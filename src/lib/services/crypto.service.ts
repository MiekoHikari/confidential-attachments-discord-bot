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

export async function sha256Hash(data: Buffer): Promise<string> {
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

	return hashHex;
}
