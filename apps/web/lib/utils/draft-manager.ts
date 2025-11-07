/**
 * 图片编辑草稿管理器
 * 使用localStorage自动保存/恢复编辑状态
 */

import type { ImageAdjustments } from '../image-processor';

const DRAFT_KEY_PREFIX = 'photo-edit-draft-';
const DRAFT_TIMESTAMP_SUFFIX = '-timestamp';
const DRAFT_EXPIRY_DAYS = 7; // 草稿保留7天

export interface EditDraft {
  photoId: string;
  adjustments: Partial<ImageAdjustments>;
  timestamp: number;
}

/**
 * 检查localStorage是否可用
 */
function isLocalStorageAvailable(): boolean {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 生成草稿存储key
 */
function getDraftKey(photoId: string): string {
  return `${DRAFT_KEY_PREFIX}${photoId}`;
}

/**
 * 生成时间戳存储key
 */
function getTimestampKey(photoId: string): string {
  return `${getDraftKey(photoId)}${DRAFT_TIMESTAMP_SUFFIX}`;
}

/**
 * 保存编辑草稿
 */
export function saveDraft(photoId: string, adjustments: Partial<ImageAdjustments>): boolean {
  if (!isLocalStorageAvailable()) {
    console.warn('localStorage not available, draft not saved');
    return false;
  }

  try {
    const draft: EditDraft = {
      photoId,
      adjustments,
      timestamp: Date.now()
    };

    localStorage.setItem(getDraftKey(photoId), JSON.stringify(draft));
    localStorage.setItem(getTimestampKey(photoId), String(draft.timestamp));

    console.log(`[DraftManager] Draft saved for photo ${photoId}`);
    return true;
  } catch (error) {
    console.error('[DraftManager] Failed to save draft:', error);
    return false;
  }
}

/**
 * 加载编辑草稿
 */
export function loadDraft(photoId: string): EditDraft | null {
  if (!isLocalStorageAvailable()) {
    return null;
  }

  try {
    const draftJson = localStorage.getItem(getDraftKey(photoId));
    if (!draftJson) {
      return null;
    }

    const draft: EditDraft = JSON.parse(draftJson);

    // 检查草稿是否过期
    const draftAge = Date.now() - draft.timestamp;
    const maxAge = DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    if (draftAge > maxAge) {
      console.log(`[DraftManager] Draft expired for photo ${photoId}`);
      clearDraft(photoId);
      return null;
    }

    console.log(`[DraftManager] Draft loaded for photo ${photoId}`, draft.adjustments);
    return draft;
  } catch (error) {
    console.error('[DraftManager] Failed to load draft:', error);
    return null;
  }
}

/**
 * 检查是否存在草稿
 */
export function hasDraft(photoId: string): boolean {
  if (!isLocalStorageAvailable()) {
    return false;
  }

  const timestampStr = localStorage.getItem(getTimestampKey(photoId));
  if (!timestampStr) {
    return false;
  }

  const timestamp = parseInt(timestampStr, 10);
  const draftAge = Date.now() - timestamp;
  const maxAge = DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  return draftAge <= maxAge;
}

/**
 * 清除草稿
 */
export function clearDraft(photoId: string): void {
  if (!isLocalStorageAvailable()) {
    return;
  }

  try {
    localStorage.removeItem(getDraftKey(photoId));
    localStorage.removeItem(getTimestampKey(photoId));
    console.log(`[DraftManager] Draft cleared for photo ${photoId}`);
  } catch (error) {
    console.error('[DraftManager] Failed to clear draft:', error);
  }
}

/**
 * 清除所有过期草稿
 */
export function clearExpiredDrafts(): void {
  if (!isLocalStorageAvailable()) {
    return;
  }

  try {
    const keys = Object.keys(localStorage);
    const now = Date.now();
    const maxAge = DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    keys.forEach(key => {
      if (key.startsWith(DRAFT_KEY_PREFIX) && key.endsWith(DRAFT_TIMESTAMP_SUFFIX)) {
        const timestampStr = localStorage.getItem(key);
        if (timestampStr) {
          const timestamp = parseInt(timestampStr, 10);
          if (now - timestamp > maxAge) {
            const photoId = key
              .replace(DRAFT_KEY_PREFIX, '')
              .replace(DRAFT_TIMESTAMP_SUFFIX, '');
            clearDraft(photoId);
          }
        }
      }
    });

    console.log('[DraftManager] Expired drafts cleared');
  } catch (error) {
    console.error('[DraftManager] Failed to clear expired drafts:', error);
  }
}

/**
 * 获取草稿的可读时间描述
 */
export function getDraftAge(photoId: string): string | null {
  const timestampStr = localStorage.getItem(getTimestampKey(photoId));
  if (!timestampStr) {
    return null;
  }

  const timestamp = parseInt(timestampStr, 10);
  const ageMs = Date.now() - timestamp;
  const ageMinutes = Math.floor(ageMs / (1000 * 60));
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  if (ageMinutes < 1) {
    return '刚刚';
  } else if (ageMinutes < 60) {
    return `${ageMinutes}分钟前`;
  } else if (ageHours < 24) {
    return `${ageHours}小时前`;
  } else {
    return `${ageDays}天前`;
  }
}
