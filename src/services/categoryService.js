import { getStore, promisify, STORES } from './db.js';
import { createCategory } from '../models/Category.js';

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

export { getAllCategories, getCategoryById, saveCategory, deleteCategory };
