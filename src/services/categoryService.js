import { getStore, promisify, STORES } from './db.js';
import { createCategory } from '../models/Category.js';
import { getAllRecords } from './recordService.js';

async function getAllCategories() {
  return promisify(getStore(STORES.CATEGORIES).getAll());
}

async function getCategoryById(id) {
  return promisify(getStore(STORES.CATEGORIES).get(id));
}

async function saveCategory(data) {
  const category = data.id ? data : createCategory(data);
  await promisify(getStore(STORES.CATEGORIES, 'readwrite').put(category));
  return category;
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
    const catRecords = records.filter((r) => r.categoryId === cat.id);
    let createdAt;
    if (catRecords.length) {
      createdAt = catRecords.reduce(
        (min, r) => (r.createdAt < min ? r.createdAt : min),
        catRecords[0].createdAt,
      );
    } else {
      createdAt = new Date().toISOString();
    }
    await promisify(getStore(STORES.CATEGORIES, 'readwrite').put({ ...cat, createdAt }));
  }
}

export { getAllCategories, getCategoryById, saveCategory, deleteCategory, migrateCategoryCreatedAt };
