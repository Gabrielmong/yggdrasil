export interface EditableBookFields {
  title: string;
  authors: string[];
  description: string | null;
  genres: string[];
  tags: string[];
  coverUrl: string | null;
  coverImageId: string | null;
}

export type BookEditPatch = Partial<EditableBookFields>;

export interface BookEditDiff {
  previousValues: BookEditPatch;
  newValues: BookEditPatch;
}

function fieldsEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

function copyField<K extends keyof EditableBookFields>(
  key: K,
  value: EditableBookFields[K],
  target: BookEditPatch
) {
  target[key] = value;
}

/** Computes the previous/new-value diff for a patch against a book's
 * current editable fields — only the fields that actually changed. Returns
 * null if the patch doesn't change anything. */
export function computeBookEditDiff(
  current: EditableBookFields,
  patch: BookEditPatch
): BookEditDiff | null {
  const previousValues: BookEditPatch = {};
  const newValues: BookEditPatch = {};

  (Object.keys(patch) as (keyof EditableBookFields)[]).forEach((key) => {
    const newValue = patch[key];
    if (newValue === undefined) return;
    if (fieldsEqual(current[key], newValue)) return;
    copyField(key, current[key], previousValues);
    copyField(key, newValue as never, newValues);
  });

  if (Object.keys(newValues).length === 0) return null;
  return { previousValues, newValues };
}

/** Computes the diff for undoing a specific edit: previousValues = the
 * book's current values for the fields that edit touched (what's being
 * undone), newValues = that edit's own previousValues (what we're
 * restoring). */
export function computeRevertDiff(
  current: EditableBookFields,
  editToRevert: BookEditPatch
): BookEditDiff | null {
  const previousValues: BookEditPatch = {};
  const newValues: BookEditPatch = {};

  (Object.keys(editToRevert) as (keyof EditableBookFields)[]).forEach((key) => {
    const restoredValue = editToRevert[key];
    if (restoredValue === undefined) return;
    if (fieldsEqual(current[key], restoredValue)) return;
    copyField(key, current[key], previousValues);
    copyField(key, restoredValue as never, newValues);
  });

  if (Object.keys(newValues).length === 0) return null;
  return { previousValues, newValues };
}
