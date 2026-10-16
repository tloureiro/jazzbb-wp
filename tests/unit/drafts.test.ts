import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftKey, readDraft, writeDraft } from '../../admin/src/drafts.ts';

function storage() {
	const values = new Map<string, string>();
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => { values.set(key, value); },
		removeItem: (key: string) => { values.delete(key); },
	};
}

test('post 1 recovery never changes post 12, other users or WordPress backups', () => {
	const store = storage();
	store.setItem('wp-autosave-12', 'original');
	writeDraft(store, draftKey(1, 12), 'post twelve', '');
	writeDraft(store, draftKey(2, 1), 'other user', '');
	writeDraft(store, draftKey(1, 1), 'unsaved', 'saved');
	assert.equal(readDraft(store, draftKey(1, 1)), 'unsaved');
	writeDraft(store, draftKey(1, 1), 'saved', 'saved');
	assert.equal(readDraft(store, draftKey(1, 1)), null);
	assert.equal(readDraft(store, draftKey(1, 12)), 'post twelve');
	assert.equal(readDraft(store, draftKey(2, 1)), 'other user');
	assert.equal(store.getItem('wp-autosave-12'), 'original');
});

test('empty draft remains recoverable when the saved post is nonempty', () => {
	const store = storage();
	writeDraft(store, draftKey(1, 1), '', 'old content');
	assert.equal(readDraft(store, draftKey(1, 1)), '');
});

test('invalid data is reported without deleting recovery material', () => {
	const store = storage();
	for (const value of ['broken json', '{"markdown":42}', 'null']) {
		store.setItem('key', value);
		assert.throws(() => readDraft(store, 'key'));
		assert.equal(store.getItem('key'), value);
	}
});

test('storage errors propagate to the visible recovery warning', () => {
	assert.throws(() => readDraft({ getItem() { throw new Error('blocked'); } }, 'key'), /blocked/);
	assert.throws(() => writeDraft({ setItem() { throw new Error('quota'); }, removeItem() {} }, 'key', 'draft', ''), /quota/);
});
