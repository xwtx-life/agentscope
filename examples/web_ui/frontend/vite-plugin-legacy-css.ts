/**
 * Post-process built CSS with Lightning CSS targeting Chrome 106+.
 * Lowers oklch / color-mix / nesting leftovers that Tailwind v4 may emit.
 * Best-effort: Tailwind v4 still officially requires Chrome 111+.
 */
import type { Plugin } from 'vite';

/** First color arg inside color-mix(...); drop the rest so old Chrome keeps a solid color. */
function firstColorMixArg(mix: string): string {
	const inner = mix.replace(/^color-mix\(\s*/i, '').replace(/\)\s*$/, '');
	// "in oklch, COLOR, ..." or "in srgb, COLOR ..."
	const m = inner.match(
		/^in\s+[a-z0-9-]+(?:\s+[a-z0-9-]+)?\s*,\s*(.+)$/i,
	);
	if (!m) return 'currentColor';
	const rest = m[1];
	// COLOR may be var(--x), #hex, rgb(...), or "var(--x) 50%"
	const color = rest.match(
		/^(var\([^)]+\)|#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)(?:\s+[\d.]+%?)?/,
	);
	return color ? color[1].trim() : 'currentColor';
}

function stripModernColor(css: string): string {
	// Nested color-mix can appear; iterate until stable.
	let prev = '';
	let out = css;
	while (out !== prev) {
		prev = out;
		out = out.replace(/color-mix\((?:[^()]|\([^)]*\))*\)/gi, (m) =>
			firstColorMixArg(m),
		);
	}
	// Relative-color oklch (Chrome 111+) — keep text visible.
	out = out.replace(/oklch\(from[^)]*\)/gi, 'currentColor');
	// Any plain oklch(...) lightningcss left behind.
	out = out.replace(/oklch\([^)]*\)/gi, 'currentColor');
	return out;
}

export function legacyCssChrome106(): Plugin {
	return {
		name: 'legacy-css-chrome-106',
		apply: 'build',
		async generateBundle(_options, bundle) {
			let transform: typeof import('lightningcss').transform;
			try {
				({ transform } = await import('lightningcss'));
			} catch {
				this.warn(
					'lightningcss not found; skip Chrome 106 CSS lowering. ' +
						'Install: npm i -D lightningcss',
				);
				return;
			}

			const targets = { chrome: 106 << 16 };

			for (const [fileName, chunk] of Object.entries(bundle)) {
				if (!fileName.endsWith('.css') || chunk.type !== 'asset') continue;
				const source =
					typeof chunk.source === 'string'
						? chunk.source
						: Buffer.from(chunk.source).toString('utf8');
				try {
					const result = transform({
						filename: fileName,
						code: Buffer.from(source),
						targets,
						minify: true,
						errorRecovery: true,
					});
					let css = new TextDecoder('utf-8').decode(result.code);
					css = stripModernColor(css);
					chunk.source = css;
				} catch (err) {
					this.warn(
						`legacy CSS transform failed for ${fileName}: ${
							err instanceof Error ? err.message : String(err)
						}`,
					);
				}
			}
		},
	};
}
