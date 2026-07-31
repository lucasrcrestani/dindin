import { getStore, promisify, STORES } from './db.js';
import { createTag } from '../models/Tag.js';

function normalizeTagName(name) {
  return String(name ?? '').trim().toLowerCase();
}

function uniqueTagNames(tagNames = []) {
  const seen = new Set();
  const unique = [];

  tagNames.forEach((tagName) => {
    const name = String(tagName ?? '').trim();
    const normalizedName = normalizeTagName(name);
    if (!normalizedName || seen.has(normalizedName)) return;
    seen.add(normalizedName);
    unique.push(name);
  });

  return unique;
}

function uniqueTagIds(tagIds = []) {
  return [...new Set((tagIds ?? []).filter(Boolean))];
}

async function getAllTags() {
  return promisify(getStore(STORES.TAGS).getAll());
}

async function getTagMapById() {
  const tags = await getAllTags();
  return new Map(tags.map((tag) => [tag.id, tag]));
}

async function ensureTagIds(tagNames = []) {
  const uniqueNames = uniqueTagNames(tagNames);
  if (uniqueNames.length === 0) return [];

  const existingTags = await getAllTags();
  const tagsByNormalizedName = new Map(existingTags.map((tag) => [tag.normalizedName, tag]));
  const store = getStore(STORES.TAGS, 'readwrite');
  const resolvedTagIds = [];

  for (const name of uniqueNames) {
    const normalizedName = normalizeTagName(name);
    const existingTag = tagsByNormalizedName.get(normalizedName);
    if (existingTag) {
      resolvedTagIds.push(existingTag.id);
      continue;
    }

    const tag = createTag({ name });
    await promisify(store.put(tag));
    tagsByNormalizedName.set(normalizedName, tag);
    resolvedTagIds.push(tag.id);
    console.log('[Tag] Tag salva:', tag.name, `(id: ${tag.id})`);
  }

  return uniqueTagIds(resolvedTagIds);
}

async function resolveTagNames(tagIds = []) {
  if (!tagIds.length) return [];
  const tagMapById = await getTagMapById();
  return uniqueTagIds(tagIds)
    .map((tagId) => tagMapById.get(tagId)?.name)
    .filter(Boolean);
}

async function hydrateEntityTags(entity) {
  if (!entity) return entity;
  const tags = await resolveTagNames(entity.tagIds ?? []);
  return { ...entity, tags };
}

async function hydrateEntityTagsList(entities = []) {
  if (!entities.length) return [];
  const tagMapById = await getTagMapById();
  return entities.map((entity) => ({
    ...entity,
    tags: uniqueTagIds(entity.tagIds ?? []).map((tagId) => tagMapById.get(tagId)?.name).filter(Boolean),
  }));
}

async function resolveInputTagIds(data = {}, required = false) {
  if (Array.isArray(data.tagIds) && data.tagIds.length > 0) {
    return uniqueTagIds(data.tagIds);
  }

  const resolvedTagIds = await ensureTagIds(data.tags ?? []);
  if (required && resolvedTagIds.length === 0) {
    throw new Error('Ao menos uma tag é obrigatória.');
  }

  return resolvedTagIds;
}

export {
  ensureTagIds,
  getAllTags,
  getTagMapById,
  hydrateEntityTags,
  hydrateEntityTagsList,
  normalizeTagName,
  resolveInputTagIds,
  resolveTagNames,
  uniqueTagIds,
  uniqueTagNames,
};