import { Editor, Node, PasteRule, mergeAttributes } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import ImageResize from 'tiptap-extension-resize-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import MarkdownIt from 'markdown-it';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItTaskLists from 'markdown-it-task-lists';
import { common, createLowlight } from 'lowlight';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import php from 'highlight.js/lib/languages/php';
import Heading from '@tiptap/extension-heading';
import type { MarkdownStorage } from 'tiptap-markdown';
import { draftKey, readDraft, writeDraft } from './drafts';
import './styles/main.css';

type BootstrapData = {
	restUrl: string;
	nonce: string;
	markdown: string;
	postId: number;
	userId: number;
};

type HeadingItem = {
	id: string;
	text: string;
	level: number;
};

type IframeAttributes = {
	src: string;
	title?: string | null;
	width?: number;
	height?: number;
	frameborder?: number;
	allow?: string;
	allowfullscreen?: boolean;
	referrerpolicy?: string;
};

const DEFAULT_IFRAME_ATTRIBUTES: Omit<IframeAttributes, 'src'> = {
	title: 'Embedded content',
	width: 560,
	height: 315,
	frameborder: 0,
	allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
	allowfullscreen: true,
	referrerpolicy: 'strict-origin-when-cross-origin',
};

declare global {
	interface Window {
		jazzbbWpData?: BootstrapData;
		jazzbbWpEditor?: {
			getMarkdown: () => string;
			getHTML: () => string;
			setMarkdown: (markdown: string) => void;
			insertIframe: (value: string) => void;
		};
	}
}

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('php', php);

const markdownItRenderer = createMarkdownRenderer();
const lowlight = createLowlight(common);
const ResizableImage = ImageResize.extend({
	name: 'image',
});

const Iframe = Node.create({
	name: 'iframe',
	group: 'block',
	defining: true,
	atom: true,
	content: '',
	addAttributes() {
		return {
			src: {
				default: null,
			},
			title: {
				default: null,
			},
			width: {
				default: 560,
			},
			height: {
				default: 315,
			},
			frameborder: {
				default: 0,
			},
			allow: {
				default: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
			},
			allowfullscreen: {
				default: true,
			},
			referrerpolicy: {
				default: 'strict-origin-when-cross-origin',
			},
		};
	},
	parseHTML() {
		return [
			{
				tag: 'iframe',
				getAttrs: (element) => safeEmbedUrl(element.getAttribute('src') || '') ? null : false,
			},
		];
	},
	renderHTML({ HTMLAttributes }) {
		const attrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
		if (attrs.allowfullscreen === true) {
			attrs.allowfullscreen = 'true';
		}
		return ['iframe', attrs];
	},
	addPasteRules() {
		return [
			new PasteRule({
				find: /<iframe[\s\S]*?<\/iframe>/gi,
				handler: ({ match, chain }) => {
					const attrs = normalizeIframeAttributes(match[0]);
					if (!attrs) return;
					chain()
						.focus()
						.insertContent({
							type: this.name,
							attrs,
						})
						.run();
				},
			}),
		];
	},
});

document.addEventListener('DOMContentLoaded', () => {
	if (!window.jazzbbWpData) {
		return;
	}

	const form = document.querySelector<HTMLFormElement>('form#post');
	const contentField = document.querySelector<HTMLTextAreaElement>('#content');
	const markdownField = document.querySelector<HTMLTextAreaElement>('#jazzbb-wp-markdown');
	const htmlField = document.querySelector<HTMLTextAreaElement>('#jazzbb-wp-html');
	const mount = document.querySelector<HTMLDivElement>('#jazzbb-wp-editor-root');

	if (!form || !contentField || !markdownField || !htmlField || !mount) {
		return;
	}

	const initialMarkdown = window.jazzbbWpData.markdown || '';
	const recoveryKey = draftKey(window.jazzbbWpData.userId, window.jazzbbWpData.postId);
	const outlineContainer = document.querySelector<HTMLElement>('#jazzbb-wp-outline');
	const outlineList = document.querySelector<HTMLElement>('#jazzbb-wp-outline-list');

	const shell = buildShell(mount);
	const { html: initialHtml, headings: initialHeadings } = renderHtmlWithHeadings(initialMarkdown);
	const statusEl = shell.status;

	// Populate hidden fields with initial values.
	markdownField.value = initialMarkdown;
	contentField.value = initialHtml;
	htmlField.value = initialHtml;
	renderOutline(outlineContainer, outlineList, initialHeadings);

	const editor = buildEditor(shell.surface, initialHtml, {
		onChange: () => {
			const markdown = getMarkdown(editor);
			markdownField.value = markdown;
			const { html, headings } = renderHtmlWithHeadings(markdown);
			contentField.value = html;
			htmlField.value = html;
			renderOutline(outlineContainer, outlineList, headings);
			statusEl.textContent = 'Ready to save';
			try {
				writeDraft(window.localStorage, recoveryKey, markdown, initialMarkdown);
			} catch {
				statusEl.textContent = 'Local recovery unavailable. Save your work before leaving.';
			}
		},
		onUploadStart: () => {
			statusEl.textContent = 'Uploading image...';
		},
		onUploadDone: (success) => {
			statusEl.textContent = success ? 'Image uploaded' : 'Upload failed';
		},
	});
	// Only a fully initialized editor may submit generated fields or hide native UI.
	markdownField.name = 'jazzbb_markdown';
	htmlField.name = 'jazzbb_html';
	markdownField.disabled = htmlField.disabled = false;
	document.body.classList.add('jazzbb-wp-ready');
	statusEl.textContent = 'Ready to save';

	buildFontScaler(shell.scaleContainer, shell.container, (scale) => {
		shell.container.style.setProperty('--jazzbb-font-scale', scale.toString());
	});

	// Keep hidden fields fresh before submit.
	form.addEventListener('submit', () => {
		const markdown = getMarkdown(editor);
		markdownField.value = markdown;
		const { html, headings } = renderHtmlWithHeadings(markdown);
		contentField.value = html;
		htmlField.value = html;
		renderOutline(outlineContainer, outlineList, headings);
	});

	window.jazzbbWpEditor = {
		getMarkdown: () => getMarkdown(editor),
		getHTML: () => renderHtmlWithHeadings(getMarkdown(editor)).html,
		setMarkdown: (markdown: string) => {
			const { html, headings } = renderHtmlWithHeadings(markdown);
			editor.commands.setContent(html);
			markdownField.value = markdown;
			contentField.value = html;
			htmlField.value = html;
			renderOutline(outlineContainer, outlineList, headings);
		},
		insertIframe: (value: string) => {
			const attrs = normalizeIframeAttributes(value);
			if (!attrs) return;
			editor
				.chain()
				.focus()
				.insertContent({
					type: 'iframe',
					attrs,
				})
				.run();
		},
	};
	try {
		const recovered = readDraft(window.localStorage, recoveryKey);
		if (recovered !== null && recovered !== initialMarkdown) {
			const notice = document.createElement('div');
			notice.className = 'jazzbb-wp-recovery notice notice-warning';
			notice.setAttribute('role', 'status');
			const message = document.createElement('p');
			message.textContent = 'An unsaved Markdown draft is available for this post.';
			notice.appendChild(message);
			for (const [label, action] of [
				['Restore draft', () => window.jazzbbWpEditor?.setMarkdown(recovered)],
				['Discard draft', () => window.localStorage.removeItem(recoveryKey)],
			] as const) {
				const button = document.createElement('button');
				button.type = 'button';
				button.className = 'button';
				button.textContent = label;
				button.addEventListener('click', () => {
					try { action(); notice.remove(); }
					catch { statusEl.textContent = 'Local recovery unavailable. Save your work before leaving.'; }
				});
				notice.appendChild(button);
			}
			mount.prepend(notice);
		} else if (recovered !== null) {
			window.localStorage.removeItem(recoveryKey);
		}
	} catch {
		statusEl.textContent = 'Local recovery unavailable. Save your work before leaving.';
	}
});

function getMarkdown(editor: Editor): string {
	return (editor.storage as typeof editor.storage & { markdown: MarkdownStorage }).markdown.getMarkdown();
}

function renderHtmlWithHeadings(markdown: string): { html: string; headings: HeadingItem[] } {
	const normalized = markdown.trim();
	if (normalized === '') {
		return { html: '', headings: [] };
	}

	const tokens = markdownItRenderer.parse(normalized, {});
	const headings: HeadingItem[] = [];
	const slugCounts = new Map<string, number>();

	for (let i = 0; i < tokens.length; i += 1) {
		const token = tokens[i];
		if (token.type !== 'heading_open') continue;
		const inline = tokens[i + 1];
		if (!inline || inline.type !== 'inline') continue;
		const text = inline.content.trim();
		if (!text) continue;
		const level = Number.parseInt(token.tag.replace('h', ''), 10) || 0;
		if (!level) continue;

		const slugBase = slugify(text);
		const count = slugCounts.get(slugBase) ?? 0;
		slugCounts.set(slugBase, count + 1);
		const id = count === 0 ? slugBase : `${slugBase}-${count}`;

		token.attrSet('id', id);
		token.attrSet('tabindex', '-1');
		headings.push({ id, text, level });
	}

	const html = markdownItRenderer.renderer.render(tokens, markdownItRenderer.options, {});
	return { html, headings };
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[`~!@#$%^&*()+={}\[\]|\\:;"'<>,.?/]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

function createMarkdownRenderer(): MarkdownIt {
	const md: MarkdownIt = new MarkdownIt({
		html: true,
		linkify: true,
		typographer: true,
		breaks: false,
		highlight(code, language): string {
			try {
				const { value, language: detected } = hljs.highlightAuto(code, language ? [language] : undefined);
				const langClass = (detected || language || 'text').replace(/[^\w+-]+/g, '');
				return `<pre class="hljs"><code class="language-${langClass}">${value}</code></pre>`;
			} catch (error) {
				return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`;
			}
		},
	});

	md.use(markdownItTaskLists, { label: true, labelAfter: true });
	md.use(markdownItFootnote);

	return md;
}

type EditorHooks = {
	onChange: () => void;
	onUploadStart: () => void;
	onUploadDone: (success: boolean) => void;
};

function buildEditor(
	target: HTMLElement,
	initialHtml: string,
	hooks: EditorHooks
): Editor {
	let fileHandler: ((files: FileList | null) => Promise<void>) | null = null;

	const editor = new Editor({
		element: target,
		content: initialHtml,
		editorProps: {
			attributes: {
				class: 'jazzbb-wp-editor',
			},
		},
		extensions: [
			StarterKit.configure({ codeBlock: false, link: false, heading: false }),
			Heading.extend({
				addAttributes() {
					return {
						...this.parent?.(),
						id: {
							default: null,
							parseHTML: (element) => element.getAttribute('id'),
							renderHTML: (attrs) => (attrs.id ? { id: attrs.id } : {}),
						},
						tabindex: {
							default: null,
							parseHTML: (element) => element.getAttribute('tabindex'),
							renderHTML: (attrs) => (attrs.tabindex ? { tabindex: attrs.tabindex } : {}),
						},
					};
				},
			}).configure({ levels: [1, 2, 3, 4, 5, 6] }),
			CodeBlockLowlight.configure({ lowlight }),
			Markdown.configure({
				transformCopiedText: true,
				transformPastedText: true,
				html: true,
				breaks: false,
				tightLists: true,
				linkify: true,
			}),
			Placeholder.configure({
				placeholder: 'Start writing in Markdown...',
			}),
			TaskList.configure({}),
			TaskItem.configure({ nested: true }),
			Link.configure({
				openOnClick: true,
				autolink: true,
				linkOnPaste: true,
				HTMLAttributes: {
					target: '_blank',
					rel: 'noreferrer noopener',
				},
			}),
			ResizableImage.configure({ inline: false }),
			Iframe.configure({
				HTMLAttributes: {
					referrerpolicy: 'strict-origin-when-cross-origin',
					allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
				},
			}),
			Table.configure({ resizable: true }),
			TableRow,
			TableHeader,
			TableCell,
		],
		onUpdate: () => hooks.onChange(),
	});

	fileHandler = wireUploads(editor, hooks);
	wireToolbar(target, editor, fileHandler);

	return editor;
}

function renderOutline(container: HTMLElement | null, listEl: HTMLElement | null, headings: HeadingItem[]): void {
	if (!container || !listEl) return;

	listEl.innerHTML = '';

	const empty = container.querySelector('.jazzbb-wp-outline-empty');

	if (!headings.length) {
		if (empty) {
			empty.textContent = 'No headings yet';
			empty.classList.add('visible');
		}
		return;
	}

	if (empty) {
		empty.textContent = '';
		empty.classList.remove('visible');
	}

	for (const heading of headings) {
		const item = document.createElement('li');
		item.className = `jazzbb-wp-outline-item level-${heading.level}`;

		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = heading.text;
		button.addEventListener('click', () => {
			const target = document.getElementById(heading.id);
			if (target) {
				target.scrollIntoView({ block: 'start', behavior: 'smooth' });
				if (typeof (target as HTMLElement).focus === 'function') {
					(target as HTMLElement).focus();
				}
			}
		});

		item.appendChild(button);
		listEl.appendChild(item);
	}
}

function buildFontScaler(toolbar: HTMLElement, container: HTMLElement, onChange: (scale: number) => void): void {
	const wrapper = document.createElement('div');
	wrapper.className = 'jazzbb-wp-scale';

	const label = document.createElement('span');
	label.textContent = 'Text size';
	label.style.fontWeight = '600';

	const input = document.createElement('input');
	input.type = 'range';
	input.min = '1';
	input.max = '4';
	input.step = '0.1';
	input.value = container.style.getPropertyValue('--jazzbb-font-scale') || '1';

	const display = document.createElement('span');
	display.textContent = `${parseFloat(input.value || '1').toFixed(1)}x`;

	const update = (value: string) => {
		const num = Math.max(1, Math.min(4, Number.parseFloat(value) || 1));
		input.value = num.toString();
		display.textContent = `${num.toFixed(1)}x`;
		onChange(num);
	};

	input.addEventListener('input', (e) => {
		const target = e.target as HTMLInputElement;
		update(target.value);
	});

	update(input.value);

	wrapper.appendChild(label);
	wrapper.appendChild(input);
	wrapper.appendChild(display);
	if (toolbar.firstChild) {
		toolbar.insertBefore(wrapper, toolbar.firstChild);
	} else {
		toolbar.appendChild(wrapper);
	}
}

function wireUploads(
	editor: Editor,
	hooks: EditorHooks
): (files: FileList | null) => Promise<void> {
	const uploadToWordPress = async (file: File): Promise<string | null> => {
		const data = new FormData();
		data.append('file', file, file.name);

		try {
			const response = await fetch(`${window.jazzbbWpData?.restUrl}wp/v2/media`, {
				method: 'POST',
				headers: {
					'X-WP-Nonce': window.jazzbbWpData?.nonce || '',
				},
				body: data,
			});

			if (!response.ok) {
				return null;
			}

			const payload = await response.json();
			return payload?.source_url ?? null;
		} catch (error) {
			console.error('Upload failed', error);
			return null;
		}
	};

	const handleFiles = async (files: FileList | null) => {
		if (!files?.length) {
			return;
		}

		const file = files[0];
		if (!file.type.startsWith('image/')) {
			return;
		}

		hooks.onUploadStart();
		const url = await uploadToWordPress(file);
		if (url) {
			editor
				.chain()
				.focus()
				.setImage({ src: url, alt: file.name })
				.run();
			hooks.onUploadDone(true);
		} else {
			hooks.onUploadDone(false);
		}
	};

	const dom = editor.view.dom;
	dom.addEventListener('drop', (event) => {
		if (event.dataTransfer?.files?.length) {
			event.preventDefault();
			handleFiles(event.dataTransfer.files);
		}
	});

	dom.addEventListener('paste', (event) => {
		if (event.clipboardData?.files?.length) {
			handleFiles(event.clipboardData.files);
		}
	});

	return handleFiles;
}

function wireToolbar(
	target: HTMLElement,
	editor: Editor,
	handleFiles: ((files: FileList | null) => Promise<void>) | null
): void {
	const shell = target.closest('.jazzbb-wp-shell');
	if (!shell) {
		return;
	}

	const toolbar = shell.querySelector('.jazzbb-wp-toolbar');
	if (!toolbar) {
		return;
	}

	const buttons: Array<[string, () => void]> = [
		['B', () => editor.chain().focus().toggleBold().run()],
		['I', () => editor.chain().focus().toggleItalic().run()],
		['Code', () => editor.chain().focus().toggleCodeBlock().run()],
		['H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
		['H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run()],
		['Quote', () => editor.chain().focus().toggleBlockquote().run()],
		['UL', () => editor.chain().focus().toggleBulletList().run()],
		['OL', () => editor.chain().focus().toggleOrderedList().run()],
		['Task', () => editor.chain().focus().toggleTaskList().run()],
		[
			'Table',
			() =>
				editor
					.chain()
					.focus()
					.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
					.run(),
		],
		[
			'Link',
			() => {
				const url = window.prompt('Enter link URL');
				if (!url) {
					editor.chain().focus().unsetLink().run();
					return;
				}
				editor.chain().focus().setLink({ href: url }).run();
			},
		],
		[
			'Image',
			() => {
				const input = document.createElement('input');
				input.type = 'file';
				input.accept = 'image/*';
				input.addEventListener('change', () => {
					if (input.files?.length && handleFiles) {
						handleFiles(input.files);
					}
				});
				input.click();
			},
		],
		[
			'Iframe',
			() => {
				const value = window.prompt('Paste iframe HTML or video URL');
				if (!value) return;
				const attrs = normalizeIframeAttributes(value);
				if (!attrs) return;
				editor
					.chain()
					.focus()
					.insertContent({
						type: 'iframe',
						attrs,
					})
					.run();
			},
		],
	];

	for (const [label, action] of buttons) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'jazzbb-wp-button';
		button.textContent = label;
		button.addEventListener('click', (event) => {
			event.preventDefault();
			action();
		});
		toolbar.appendChild(button);
	}
}

type Shell = {
	container: HTMLElement;
	toolbar: HTMLElement;
	status: HTMLElement;
	surface: HTMLElement;
	scaleContainer: HTMLElement;
};

function buildShell(mount: HTMLElement): Shell {
	const container = document.createElement('div');
	container.className = 'jazzbb-wp-shell';

	const controls = document.createElement('div');
	controls.className = 'jazzbb-wp-controls';

	const scaleContainer = document.createElement('div');
	scaleContainer.className = 'jazzbb-wp-scale';

	const toolbar = document.createElement('div');
	toolbar.className = 'jazzbb-wp-toolbar';

	controls.appendChild(scaleContainer);
	controls.appendChild(toolbar);

	const status = document.createElement('div');
	status.className = 'jazzbb-wp-status';
	status.setAttribute('role', 'status');
	status.setAttribute('aria-live', 'polite');

	const surface = document.createElement('div');
	surface.className = 'jazzbb-wp-editor-surface';

	container.appendChild(controls);
	container.appendChild(status);
	container.appendChild(surface);

	mount.appendChild(container);

	return { container, toolbar, status, surface, scaleContainer };
}

function normalizeIframeAttributes(value: string): IframeAttributes | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	if (trimmed.toLowerCase().includes('<iframe')) {
		return parseIframeHtml(trimmed);
	}

	const url = tryParseUrl(trimmed);
	if (!url) {
		return null;
	}

	const fromUrl = parseIframeFromUrl(url);
	if (!fromUrl) {
		return null;
	}

	return { ...DEFAULT_IFRAME_ATTRIBUTES, ...fromUrl };
}

function parseIframeHtml(html: string): IframeAttributes | null {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');
	const iframe = doc.querySelector('iframe');
	if (!iframe) {
		return null;
	}

	const src = iframe.getAttribute('src')?.trim() ?? '';
	if (!safeEmbedUrl(src)) {
		return null;
	}

	const width = toNumericAttr(iframe.getAttribute('width'), DEFAULT_IFRAME_ATTRIBUTES.width ?? 560);
	const height = toNumericAttr(iframe.getAttribute('height'), DEFAULT_IFRAME_ATTRIBUTES.height ?? 315);
	const frameborder = toNumericAttr(
		iframe.getAttribute('frameborder'),
		DEFAULT_IFRAME_ATTRIBUTES.frameborder ?? 0
	);

	return {
		src,
		title: iframe.getAttribute('title') || DEFAULT_IFRAME_ATTRIBUTES.title,
		width,
		height,
		frameborder,
		allow: iframe.getAttribute('allow') || DEFAULT_IFRAME_ATTRIBUTES.allow,
		allowfullscreen: iframe.hasAttribute('allowfullscreen')
			? true
			: DEFAULT_IFRAME_ATTRIBUTES.allowfullscreen,
		referrerpolicy: iframe.getAttribute('referrerpolicy') || DEFAULT_IFRAME_ATTRIBUTES.referrerpolicy,
	};
}

function parseIframeFromUrl(url: URL): IframeAttributes | null {
	const host = url.hostname.replace(/^www\./, '').toLowerCase();

	if (host === 'youtu.be' || host.endsWith('youtube.com')) {
		const embed = buildYouTubeEmbed(url);
		if (!embed) {
			return null;
		}
		return {
			src: embed,
			title: 'YouTube video',
		};
	}

	return null;
}

const YOUTUBE_PASSTHROUGH_PARAMS = [
	'si',
	'start',
	'end',
	'autoplay',
	'loop',
	'playlist',
	'controls',
	'rel',
	'modestbranding',
	'playsinline',
	'mute',
];

function buildYouTubeEmbed(url: URL): string | null {
	const segments = url.pathname.split('/').filter(Boolean);
	const host = url.hostname.replace(/^www\./, '').toLowerCase();
	let videoId = '';

	if (host === 'youtu.be') {
		videoId = segments[0] || '';
	} else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
		if (segments[0] === 'watch') {
			videoId = url.searchParams.get('v') || '';
		} else if (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live') {
			videoId = segments[1] || '';
		} else if (segments.length === 1 && !url.searchParams.get('v')) {
			videoId = segments[0] || '';
		}
	}

	if (!videoId) {
		videoId = url.searchParams.get('v') || '';
	}

	if (!videoId) {
		return null;
	}

	const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
	for (const param of YOUTUBE_PASSTHROUGH_PARAMS) {
		const value = url.searchParams.get(param);
		if (value) {
			embedUrl.searchParams.set(param, value);
		}
	}

	return embedUrl.toString();
}

function toNumericAttr(value: string | null, fallback: number): number {
	if (!value) {
		return fallback;
	}
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? fallback : parsed;
}

function tryParseUrl(value: string): URL | null {
	try {
		return new URL(value);
	} catch (error) {
		return null;
	}
}

function safeEmbedUrl(value: string): boolean {
	const url = tryParseUrl(value);
	return !!url && (url.protocol === 'https:' || url.protocol === 'http:');
}
