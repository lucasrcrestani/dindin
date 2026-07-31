import { getStore, promisify, STORES } from './db.js';
import { createCategory } from '../models/Category.js';
import { getAllRecords } from './recordService.js';
import { hydrateEntityTags, hydrateEntityTagsList, resolveInputTagIds } from './tagService.js';

async function getAllRawCategories() {
  return promisify(getStore(STORES.CATEGORIES).getAll());
}

async function getAllCategories() {
  const categories = await getAllRawCategories();
  return hydrateEntityTagsList(categories);
}

async function getRawCategoryById(id) {
  return promisify(getStore(STORES.CATEGORIES).get(id));
}

async function getCategoryById(id) {
  const category = await getRawCategoryById(id);
  return hydrateEntityTags(category);
}

async function saveCategory(data) {
  const tagIds = await resolveInputTagIds(data, true);
  const category = data.id
    ? { ...data, tagIds, updatedAt: new Date().toISOString() }
    : createCategory({ ...data, tagIds });
  delete category.tags;
  await promisify(getStore(STORES.CATEGORIES, 'readwrite').put(category));
  console.log('[Category] Categoria salva:', category.name, `(id: ${category.id})`);
  return hydrateEntityTags(category);
}

async function deleteCategory(id) {
  return promisify(getStore(STORES.CATEGORIES, 'readwrite').delete(id));
}

/**
 * One-time migration: writes a `createdAt` to any category that lacks one.
 * Uses the oldest record in that category as the source; falls back to now.
 */
async function migrateCategoryCreatedAt() {
  const [categories, records] = await Promise.all([getAllCategories(), getAllRecords()]);
  const needsMigration = categories.filter((c) => !c.createdAt);
  if (!needsMigration.length) return;

  for (const cat of needsMigration) {
    const catRecords = records.filter((record) => (cat.tagIds ?? []).every((tagId) => (record.tagIds ?? []).includes(tagId)));
    let createdAt;
    if (catRecords.length) {
      createdAt = catRecords.reduce(
        (min, r) => (r.createdAt < min ? r.createdAt : min),
        catRecords[0].createdAt,
      );
    } else {
      createdAt = new Date().toISOString();
    }
    await promisify(getStore(STORES.CATEGORIES, 'readwrite').put({ ...cat, createdAt, updatedAt: cat.updatedAt ?? createdAt }));
  }
}

export {
  getAllCategories,
  getAllRawCategories,
  getCategoryById,
  getRawCategoryById,
  saveCategory,
  deleteCategory,
  migrateCategoryCreatedAt,
};
