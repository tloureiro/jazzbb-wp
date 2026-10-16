/** Local recovery is separate from WordPress server autosaves. Never scan storage. */
export function draftKey(userId: number, postId: number): string {
	return `jazzbb-wp:draft:${userId}:${postId}`;
}

export function readDraft(storage: Pick<Storage, 'getItem'>, key: string): string | null {
	const raw = storage.getItem(key);
	if (raw === null) return null;
	const draft: unknown = JSON.parse(raw);
	if (!draft || typeof draft !== 'object' || !('markdown' in draft) || typeof draft.markdown !== 'string') {
		throw new Error('Invalid recovery data');
	}
	return draft.markdown;
}

export function writeDraft(storage: Pick<Storage, 'setItem' | 'removeItem'>, key: string, markdown: string, saved: string): void {
	if (markdown === saved) storage.removeItem(key);
	else storage.setItem(key, JSON.stringify({ markdown }));
}
