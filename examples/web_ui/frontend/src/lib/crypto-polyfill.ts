/**
 * ``crypto.randomUUID`` needs a Secure Context (HTTPS or localhost).
 * LAN HTTP (e.g. http://192.168.x.x) leaves it undefined — patch once
 * so TextInput / chat send and other callers do not throw.
 */
function fallbackUUID(): `${string}-${string}-${string}-${string}-${string}` {
	const bytes = new Uint8Array(16);
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		crypto.getRandomValues(bytes);
	} else {
		for (let i = 0; i < 16; i += 1) bytes[i] = (Math.random() * 256) | 0;
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
}

const c = globalThis.crypto as Crypto | undefined;
if (!c || typeof c.randomUUID !== 'function') {
	const target = (c ?? ((globalThis as { crypto?: Crypto }).crypto = {} as Crypto)) as Crypto & {
		randomUUID: () => `${string}-${string}-${string}-${string}-${string}`;
	};
	target.randomUUID = fallbackUUID;
}
