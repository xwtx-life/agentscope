/**
 * Map known English backend / client error strings to Chinese for the UI.
 * Order matters: more specific patterns first.
 */
const DETAIL_RULES: Array<{
	match: RegExp | string;
	zh: string | ((m: RegExpMatchArray) => string);
}> = [
	{
		match: /Cannot modify session configuration while the session\s*is running\.?/i,
		zh: '会话正在运行，无法修改配置。请等待回复结束后再试。',
	},
	{
		match: /Session '([^']+)' not found\.?/i,
		zh: () => '未找到该会话。',
	},
	{
		match: /Cannot reach the server\. Check the server address and your network\.?/i,
		zh: '无法连接服务器，请检查服务器地址与网络。',
	},
	{
		match: /The server took too long to respond\.?/i,
		zh: '服务器响应超时，请稍后重试。',
	},
	{
		match: /^Network error\.?$/i,
		zh: '网络错误。',
	},
	{
		match: /Configure a realtime model before starting voice mode\.?/i,
		zh: '请先配置实时语音模型，再开启语音模式。',
	},
	{
		match: /Voice mode failed to start\.?/i,
		zh: '语音模式启动失败。',
	},
	{
		match: /Realtime voice mode is not active\.?/i,
		zh: '实时语音模式未开启。',
	},
	{
		match: /Upload failed\.?/i,
		zh: '上传失败。',
	},
	{
		match: /Internal error: missing file payload\.?/i,
		zh: '内部错误：缺少文件数据。',
	},
	{
		match: /Directory not found\.?/i,
		zh: '未找到目录。',
	},
	{
		match: /File not found\.?/i,
		zh: '未找到文件。',
	},
	{
		match: /Requested path is a file, not a directory\.?/i,
		zh: '该路径是文件，不是目录。',
	},
	{
		match: /Requested path is a directory, not a file\.?/i,
		zh: '该路径是目录，不是文件。',
	},
	{
		match: /No agent selected\.?/i,
		zh: '未选择智能体。',
	},
	{
		match: /No agent\/session selected\.?/i,
		zh: '未选择智能体或会话。',
	},
	{
		match: /invite_description must be non-empty when invitable=True/i,
		zh: '开启「允许被邀请」时，必须填写邀请说明。',
	},
	{
		match: /username already taken/i,
		zh: '用户名已被占用。',
	},
	{
		match: /Invalid username or password\.?/i,
		zh: '用户名或密码错误。',
	},
	{
		match: /department not found/i,
		zh: '未找到该部门。',
	},
	{
		match: /department name already exists/i,
		zh: '部门名称已存在。',
	},
	{
		match: /Registration is disabled\.?/i,
		zh: '当前未开放注册。',
	},
	{
		match: /The realtime control channel was closed\.?/i,
		zh: '实时控制通道已关闭。',
	},
	{
		match: /The realtime media connection was lost\.?/i,
		zh: '实时媒体连接已断开。',
	},
	{
		match: /The browser blocked realtime audio playback\.?/i,
		zh: '浏览器阻止了实时音频播放。',
	},
	{
		match: /Timed out while opening the realtime connection\.?/i,
		zh: '打开实时连接超时。',
	},
	{
		match: /The realtime connection was (stopped|closed)\.?/i,
		zh: '实时连接已断开。',
	},
];

/** Translate a single English detail string when we know a Chinese equivalent. */
export function localizeApiDetail(detail: string): string {
	const trimmed = detail.trim();
	if (!trimmed) return trimmed;
	for (const rule of DETAIL_RULES) {
		if (typeof rule.match === 'string') {
			if (trimmed === rule.match || trimmed.includes(rule.match)) {
				return typeof rule.zh === 'function'
					? rule.zh([] as unknown as RegExpMatchArray)
					: rule.zh;
			}
		} else {
			const m = trimmed.match(rule.match);
			if (m) {
				return typeof rule.zh === 'function' ? rule.zh(m) : rule.zh;
			}
		}
	}
	return trimmed;
}
